// Security / production hardening found in the 2026-11 audit. Each block pins one fix.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { base64UrlEncode, decodeLicenseToken } from '../../shared/license';
import { readLimitedText } from '../src/http';
import { runPushCron } from '../src/push/cron';
import { envelopeBytes, freshIp, harness, readJson, type Harness, BASE } from './helpers';
import { TEST_APP_ORIGIN } from './fixtures';

const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const UA_AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';

async function rateRows(prefix: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE ?').bind(`${prefix}%`).first<{ n: number }>();
  return row?.n ?? 0;
}

function newId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

async function sha256B64(bytes: Uint8Array): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

async function putPage(h: Harness, token: string, shareId: string, size: number, checkinHash: string): Promise<Response> {
  const body = envelopeBytes('PTK1', size);
  return h.authed(`/api/share/${shareId}`, token, {
    method: 'PUT',
    body,
    headers: { 'Content-Length': String(size), 'X-Checkin-Key': checkinHash },
  });
}

describe('request bodies', () => {
  it('stops reading a body without Content-Length as soon as it passes the cap', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Finite (8 MiB) so the old read-everything code fails the assertion instead of exhausting memory.
        if (pulled >= 8 * 1024 * 1024) return controller.close();
        pulled += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const request = new Request(`${BASE}/x`, { method: 'POST', body: big });
    expect(request.headers.get('Content-Length')).toBeNull();
    expect(await readLimitedText(request, 2048)).toBeNull();
    expect(pulled).toBeLessThanOrEqual(4 * chunk.length);
  });

  it('still reads small bodies with or without Content-Length', async () => {
    const small = new Request(`${BASE}/x`, { method: 'POST', body: '{"a":1}' });
    expect(await readLimitedText(small, 2048)).toBe('{"a":1}');
    const streamed = new Request(`${BASE}/x`, {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('مرحبا'));
          c.close();
        },
      }),
    });
    expect(await readLimitedText(streamed, 2048)).toBe('مرحبا');
  });
});

describe('response headers and errors', () => {
  it('JSON responses carry nosniff', async () => {
    const h = await harness();
    const res = await h.send('/api/nothing-here');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('admin and client pages also send X-Frame-Options DENY (older browsers ignore frame-ancestors)', async () => {
    const h = await harness();
    expect((await h.send('/admin')).headers.get('X-Frame-Options')).toBe('DENY');
    expect((await h.send(`/c/${newId()}`)).headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('an unexpected exception becomes a generic JSON 500 with CORS, never a stack trace', async () => {
    const h = await harness();
    h.deps.store.findByCodeHash = () => Promise.reject(new Error('D1_ERROR: secret table detail'));
    const res = await h.send('/api/activate', {
      method: 'POST',
      headers: { Origin: TEST_APP_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABCD-EFGH-JKMN', deviceId: crypto.randomUUID() }),
    });
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'server_error' });
    expect(text).not.toContain('D1_ERROR');
  });
});

describe('D1 write budget (100,000 rows / day on Free)', () => {
  it('a public client-page read spends no D1 write on rate limiting', async () => {
    const h = await harness();
    const token = await h.license();
    const shareId = newId();
    expect((await putPage(h, token, shareId, 64, await sha256B64(new Uint8Array(32)))).status).toBe(200);
    const before = await rateRows('share-read');
    const res = await h.send(`/api/share/${shareId}`);
    expect(res.status).toBe(200);
    expect(await rateRows('share-read')).toBe(before);
  });

  it('the admin login page shown to anonymous visitors spends no D1 write', async () => {
    const h = await harness();
    const before = await rateRows('admin:');
    for (let i = 0; i < 3; i++) expect((await h.send('/admin', { ip: freshIp() })).status).toBe(200);
    expect(await rateRows('admin:')).toBe(before);
  });

  it('re-sending an unchanged push schedule rewrites nothing (retry state kept); changes still apply', async () => {
    const h = await harness();
    const token = await h.license();
    const now = h.clock.now;
    const sub = { subscription: { endpoint: `https://web.push.apple.com/${newId()}`, keys: { p256dh: UA_PUBLIC, auth: UA_AUTH } } };
    expect((await h.authed('/api/push/subscribe', token, { method: 'POST', body: JSON.stringify(sub) })).status).toBe(200);
    const items = [
      { id: 'keep', at: now + 600, title: 'تذكير', body: 'عندك حصة' },
      { id: 'change', at: now + 900, title: 'تذكير', body: 'قديم' },
      { id: 'drop', at: now + 1200, title: 'تذكير', body: '' },
    ];
    const put = (list: unknown[]) => h.authed('/api/push/schedule', token, { method: 'PUT', body: JSON.stringify({ items: list }) });
    expect(await readJson(await put(items))).toEqual({ ok: true, count: 3 });
    const deviceKey = (await env.DB.prepare("SELECT device_key FROM push_items WHERE item_id = 'keep' AND due_at = ?").bind(now + 600).first<{ device_key: string }>())?.device_key ?? '';
    await env.DB.prepare('UPDATE push_items SET attempts = 2 WHERE device_key = ?').bind(deviceKey).run();

    const next = [items[0], { ...items[1], body: 'جديد' }, { id: 'new', at: now + 1500, title: 'تذكير', body: '' }];
    expect(await readJson(await put(next))).toEqual({ ok: true, count: 3 });
    const { results } = await env.DB.prepare('SELECT item_id, body, attempts FROM push_items WHERE device_key = ? ORDER BY item_id')
      .bind(deviceKey)
      .all<{ item_id: string; body: string; attempts: number }>();
    expect(results).toEqual([
      { item_id: 'change', body: 'جديد', attempts: 0 },
      { item_id: 'keep', body: 'عندك حصة', attempts: 2 },
      { item_id: 'new', body: '', attempts: 0 },
    ]);
  });
});

describe('push cron backlog', () => {
  it('drops stale reminders in bulk first, so they never starve due ones out of the batch', async () => {
    await env.DB.batch([env.DB.prepare('DELETE FROM push_items'), env.DB.prepare('DELETE FROM push_subscriptions')]);
    const sent: string[] = [];
    const pushFetch = (async (input: RequestInfo | URL) => {
      sent.push(String(input));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const h = await harness({ pushFetch, cloudConfig: { pushBatchSize: 5 } });
    const now = h.clock.now;
    const stmts = [
      env.DB.prepare('INSERT INTO push_subscriptions (device_key, lid, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        'l:d',
        'l',
        'https://web.push.apple.com/backlog',
        UA_PUBLIC,
        UA_AUTH,
        now,
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        env.DB.prepare('INSERT INTO push_items (device_key, item_id, due_at, title, body) VALUES (?, ?, ?, ?, ?)').bind('l:d', `old${i}`, now - 7200 - i, 't', ''),
      ),
      env.DB.prepare('INSERT INTO push_items (device_key, item_id, due_at, title, body) VALUES (?, ?, ?, ?, ?)').bind('l:d', 'fresh', now - 10, 't', ''),
    ];
    await env.DB.batch(stmts);
    const report = await runPushCron(h.deps.cloud, now);
    expect(report).toMatchObject({ sent: 1, stale: 12 });
    expect(sent).toHaveLength(1);
  });
});

describe('license token binding', () => {
  it('refuses a validly signed token whose device does not match the activated device', async () => {
    const h = await harness();
    const token = await h.license();
    const payload = decodeLicenseToken(token)?.payload;
    if (payload === undefined) throw new Error('no payload');
    const forged = await h.deps.crypto.signLicense({ ...payload, dev: 'f'.repeat(32) });
    expect((await h.authed('/api/backup', token, { method: 'HEAD' })).status).toBe(404);
    expect((await h.authed('/api/backup', forged, { method: 'HEAD' })).status).toBe(401);
  });
});

describe('client-page storage per license', () => {
  it('caps pages + pending check-ins per license so one trainer cannot fill the shared R2', async () => {
    const h = await harness({ cloudConfig: { pagesLicenseMaxBytes: 1000 } });
    const token = await h.license();
    const writeToken = crypto.getRandomValues(new Uint8Array(32));
    const hash = await sha256B64(writeToken);
    const first = newId();
    expect((await putPage(h, token, first, 600, hash)).status).toBe(200);
    // Replacing the same page with the same size is always fine.
    expect((await putPage(h, token, first, 600, hash)).status).toBe(200);
    const second = await putPage(h, token, newId(), 600, hash);
    expect([second.status, await readJson(second)]).toEqual([507, { error: 'storage_full' }]);

    const checkin = (size: number) =>
      h.send(`/api/share/${first}/checkins`, {
        method: 'POST',
        ip: freshIp(),
        body: envelopeBytes('PTK1', size),
        headers: { 'Content-Length': String(size), 'X-Checkin-Token': base64UrlEncode(writeToken) },
      });
    expect((await checkin(300)).status).toBe(201);
    const over = await checkin(300);
    expect([over.status, await readJson(over)]).toEqual([429, { error: 'too_many_pending' }]);
  });
});

describe('admin Origin / Referrer-Policy (live bug: Chrome sent `Origin: null` under no-referrer)', () => {
  it('admin pages never use no-referrer, so browsers send the real Origin on form posts', async () => {
    const h = await harness();
    const cookie = await h.login();
    const pages = [await h.send('/admin'), await h.send('/admin', { headers: { Cookie: cookie } }), await h.send('/admin/nope', { headers: { Cookie: cookie } })];
    for (const res of pages) {
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.headers.get('Referrer-Policy')).toBe('same-origin');
    }
  });

  it('a form post with the literal `Origin: null` is refused safely (403), the real origin is accepted', async () => {
    const h = await harness();
    const post = (origin: string) =>
      h.send('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
        body: new URLSearchParams({ password: 'wrong-password-123' }).toString(),
        ip: freshIp(),
      });
    const refused = await post('null');
    expect(refused.status).toBe(403);
    expect(refused.headers.get('Set-Cookie')).toBeNull();
    expect((await post(BASE)).status).toBe(401); // reaches the password check
  });
});
