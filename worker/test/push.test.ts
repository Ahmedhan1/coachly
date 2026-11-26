import { createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { base64UrlDecode } from '../../shared/bytes';
import worker from '../src/index';
import { DUE_QUERY, runPushCron } from '../src/push/cron';
import { ecdhParams, importEcPrivateKey } from '../src/push/webpush';
import { harness, readJson, type Harness } from './helpers';
import { TEST_VAPID_PUBLIC } from './fixtures';

// RFC 8291 Appendix A user-agent keys: lets the tests decrypt what the cron sent, like a browser would.
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const UA_PRIVATE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const UA_AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';

const b = (s: string): Uint8Array => base64UrlDecode(s) ?? new Uint8Array();

interface Sent {
  url: string;
  headers: Headers;
  body: Uint8Array;
}

/** Fake push service: records requests and answers with the status chosen per endpoint path. */
function fakePushService(statusFor: (url: string) => number = () => 201) {
  const sent: Sent[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, headers: new Headers(init?.headers), body: new Uint8Array(await new Response(init?.body).arrayBuffer()) });
    return new Response(null, { status: statusFor(url) });
  }) as typeof fetch;
  return { sent, fetcher };
}

function subscription(endpoint: string) {
  return { subscription: { endpoint, expirationTime: null, keys: { p256dh: UA_PUBLIC, auth: UA_AUTH } } };
}

async function subscribe(h: Harness, token: string, endpoint: string): Promise<Response> {
  return h.authed('/api/push/subscribe', token, { method: 'POST', body: JSON.stringify(subscription(endpoint)) });
}

function schedule(h: Harness, token: string, items: unknown[]): Promise<Response> {
  return h.authed('/api/push/schedule', token, { method: 'PUT', body: JSON.stringify({ items }) });
}

async function decrypt(body: Uint8Array): Promise<unknown> {
  const salt = body.subarray(0, 16);
  const asPublic = body.subarray(21, 86);
  const uaPrivate = await importEcPrivateKey(b(UA_PRIVATE), b(UA_PUBLIC), 'ECDH');
  const asKey = await crypto.subtle.importKey('raw', new Uint8Array(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams(asKey), uaPrivate, 256));
  const hk = async (ikm: Uint8Array, s: Uint8Array, info: Uint8Array, bits: number) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(s), info: new Uint8Array(info) },
        await crypto.subtle.importKey('raw', new Uint8Array(ikm), 'HKDF', false, ['deriveBits']),
        bits,
      ),
    );
  const enc = new TextEncoder();
  const ikm = await hk(ecdh, b(UA_AUTH), new Uint8Array([...enc.encode('WebPush: info\0'), ...b(UA_PUBLIC), ...asPublic]), 256);
  const cek = await hk(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hk(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 96);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, new Uint8Array(body.subarray(86))));
  return JSON.parse(new TextDecoder().decode(plain.subarray(0, -1)));
}

async function countRows(table: 'push_items' | 'push_subscriptions'): Promise<number> {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;
}

describe('push endpoints', () => {
  it('serves the VAPID public key without a token', async () => {
    const h = await harness();
    const res = await h.send('/api/push/vapid');
    expect(await readJson(res)).toEqual({ publicKey: TEST_VAPID_PUBLIC });
  });

  it('answers 503 for the VAPID key when the secrets are not set', async () => {
    const h = await harness({ vapid: { keys: async () => null } });
    expect((await h.send('/api/push/vapid')).status).toBe(503);
  });

  it('requires an approved account on subscribe, schedule and delete', async () => {
    const h = await harness();
    const token = await h.account();
    await h.disable(token);
    const calls: Array<[string, string]> = [
      ['POST', '/api/push/subscribe'],
      ['PUT', '/api/push/schedule'],
      ['DELETE', '/api/push'],
    ];
    for (const [method, path] of calls) {
      expect((await h.send(path, { method, body: '{}' })).status).toBe(401);
      const res = await h.authed(path, token, { method, body: '{}' });
      expect(res.status).toBe(403);
      expect(await readJson(res)).toEqual({ error: 'disabled' });
    }
  });

  it('accepts only real push-service endpoints and well-formed keys', async () => {
    const h = await harness();
    const token = await h.account();
    for (const endpoint of ['https://evil.example/push', 'http://web.push.apple.com/x', 'https://web.push.apple.com:8443/x', 'not a url']) {
      expect((await subscribe(h, token, endpoint)).status, endpoint).toBe(400);
    }
    const badKeys = { subscription: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'AAAA', auth: UA_AUTH } } };
    expect((await h.authed('/api/push/subscribe', token, { method: 'POST', body: JSON.stringify(badKeys) })).status).toBe(400);
    expect((await subscribe(h, token, 'https://web.push.apple.com/QGuQyavXutnMH')).status).toBe(200);
  });

  it('validates the schedule and replaces it as a whole for that device', async () => {
    const h = await harness();
    const token = await h.account();
    const now = h.clock.now;
    expect(await readJson(await schedule(h, token, [{ id: 'a', at: now + 60, title: 'تذكير', body: 'عندك حصة' }]))).toEqual({ error: 'no_subscription' });
    await subscribe(h, token, 'https://web.push.apple.com/device-a');

    const long = await schedule(h, token, [{ id: 'a', at: now + 60, title: 'x'.repeat(121), body: '' }]);
    expect([long.status, await readJson(long)]).toEqual([400, { error: 'text_too_long' }]);
    const longBody = await schedule(h, token, [{ id: 'a', at: now + 60, title: 'x', body: 'y'.repeat(121) }]);
    expect(await readJson(longBody)).toEqual({ error: 'text_too_long' });
    for (const bad of [
      [{ id: 'a', at: now + 60, title: '', body: '' }],
      [{ id: 'a/b', at: now + 60, title: 't', body: '' }],
      [{ id: 'a', at: now + 90 * 86_400, title: 't', body: '' }],
      [{ id: 'a', at: now + 60, title: 't', body: '' }, { id: 'a', at: now + 61, title: 't', body: '' }],
    ]) {
      expect((await schedule(h, token, bad)).status).toBe(400);
    }
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, at: now + 60, title: 't', body: '' }));
    expect(await readJson(await schedule(h, token, many))).toEqual({ error: 'too_many_items' });

    const items = [1, 2, 3].map((i) => ({ id: `s${i}`, at: now + i * 60, title: 'تذكير', body: 'عندك حصة بعد 30 دقيقة' }));
    expect(await readJson(await schedule(h, token, items))).toEqual({ ok: true, count: 3 });
    expect(await readJson(await schedule(h, token, items.slice(0, 1)))).toEqual({ ok: true, count: 1 });
    const rows = await env.DB.prepare("SELECT item_id FROM push_items WHERE item_id LIKE 's%'").all<{ item_id: string }>();
    expect(rows.results.map((r) => r.item_id)).toEqual(['s1']);

    expect(await readJson(await h.authed('/api/push', token, { method: 'DELETE' }))).toEqual({ ok: true });
    expect(await readJson(await schedule(h, token, items))).toEqual({ error: 'no_subscription' });
  });
});

describe('push cron', () => {
  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare('DELETE FROM push_items'), env.DB.prepare('DELETE FROM push_subscriptions')]);
  });

  it('sends due items in batches, oldest first, with VAPID + aes128gcm, and deletes what it sent', async () => {
    const push = fakePushService();
    const h = await harness({ pushFetch: push.fetcher, cloudConfig: { pushBatchSize: 25 } });
    const token = await h.account();
    await subscribe(h, token, 'https://web.push.apple.com/device-1');
    const now = h.clock.now;
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, at: now + i, title: 'تذكير', body: `حصة رقم ${i}` }));
    items.push({ id: 'later', at: now + 3600, title: 'بعدين', body: '' });
    await schedule(h, token, items);

    const first = await runPushCron(h.deps.cloud, now + 40);
    expect(first).toEqual({ sent: 25, gone: 0, retry: 0, failed: 0, stale: 0 });
    expect(push.sent).toHaveLength(25);
    const req = push.sent[0];
    expect(req?.url).toBe('https://web.push.apple.com/device-1');
    expect(req?.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(req?.headers.get('TTL')).toBe('3600');
    expect(req?.headers.get('Authorization')).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${TEST_VAPID_PUBLIC}$`));
    expect(await decrypt(req?.body ?? new Uint8Array())).toEqual({ v: 1, id: 'n0', title: 'تذكير', body: 'حصة رقم 0' });

    const second = await runPushCron(h.deps.cloud, now + 40);
    expect(second.sent).toBe(5);
    expect(await countRows('push_items')).toBe(1); // only the "later" item is left
    expect((await runPushCron(h.deps.cloud, now + 40)).sent).toBe(0);
  });

  it('deletes the subscription and its items when the push service answers 404 or 410', async () => {
    const push = fakePushService((url) => (url.endsWith('/gone') ? 410 : url.endsWith('/missing') ? 404 : 201));
    const h = await harness({ pushFetch: push.fetcher });
    const now = h.clock.now;
    const tokens = [await h.account(), await h.account(), await h.account()];
    const endpoints = ['https://web.push.apple.com/gone', 'https://web.push.apple.com/missing', 'https://web.push.apple.com/fine'];
    for (const [i, token] of tokens.entries()) {
      await subscribe(h, token, endpoints[i] ?? '');
      await schedule(h, token, [
        { id: 'due', at: now, title: 't', body: '' },
        { id: 'next-week', at: now + 7 * 86_400, title: 't', body: '' },
      ]);
    }
    const report = await runPushCron(h.deps.cloud, now + 10);
    expect(report).toMatchObject({ sent: 1, gone: 2 });
    expect(await countRows('push_subscriptions')).toBe(1);
    expect(await countRows('push_items')).toBe(1); // "next-week" of the healthy device
  });

  it('retries 429/5xx a few times, then gives up; drops stale reminders without sending', async () => {
    const push = fakePushService(() => 503);
    const h = await harness({ pushFetch: push.fetcher });
    const token = await h.account();
    const now = h.clock.now;
    await subscribe(h, token, 'https://fcm.googleapis.com/fcm/send/abc');
    await schedule(h, token, [
      { id: 'busy', at: now, title: 't', body: '' },
      { id: 'old', at: now - 3000, title: 't', body: '' },
    ]);
    const first = await runPushCron(h.deps.cloud, now + 700); // "old" is now > 1 h late
    expect(first).toMatchObject({ retry: 1, stale: 1 });
    expect(push.sent).toHaveLength(1);
    const row = await env.DB.prepare('SELECT attempts, due_at FROM push_items').first<{ attempts: number; due_at: number }>();
    expect(row).toEqual({ attempts: 1, due_at: now + 700 + 300 });
    await runPushCron(h.deps.cloud, now + 1000);
    await runPushCron(h.deps.cloud, now + 1300);
    expect(await countRows('push_items')).toBe(0);
    expect(push.sent).toHaveLength(3);
  });

  it('does nothing without VAPID keys', async () => {
    const push = fakePushService();
    const h = await harness({ pushFetch: push.fetcher, vapid: { keys: async () => null } });
    const token = await h.account();
    await subscribe(h, token, 'https://web.push.apple.com/x');
    await schedule(h, token, [{ id: 'a', at: h.clock.now, title: 't', body: '' }]);
    expect(await runPushCron(h.deps.cloud, h.clock.now + 1)).toEqual({ sent: 0, gone: 0, retry: 0, failed: 0, stale: 0 });
    expect(push.sent).toHaveLength(0);
  });

  it('reads due rows through the due_at index (no table scan)', async () => {
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${DUE_QUERY}`).bind(0, 25).all<{ detail: string }>();
    const details = plan.results.map((r) => r.detail).join(' | ');
    expect(details).toContain('push_items_due');
    expect(details).not.toMatch(/SCAN i\b(?! USING)/);
  });

  it('the deployed scheduled() entry point runs (nothing due at time 0)', async () => {
    const controller = createScheduledController({ scheduledTime: new Date(0), cron: '*/5 * * * *' });
    await expect(worker.scheduled(controller, env)).resolves.toBeUndefined();
  });
});
