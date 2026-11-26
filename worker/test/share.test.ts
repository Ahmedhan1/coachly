import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { generateRawKey, openWithKey, sealWithKey } from '../../shared/envelope';
import { base64UrlEncode } from '../../shared/bytes';
import { findForbiddenTerms } from '../../src/i18n/fitness-terms';
import { parseCheckinDocument, parseShareDocument } from '../src/share/document';
import { checkinKey, shareKey } from '../src/share/routes';
import { VIEWER_SCRIPT } from '../src/share/viewerScript';
import { envelopeBytes, freshIp, harness, readJson, storedBytes, type Harness } from './helpers';
import { SAMPLE_DOCUMENT } from './sampleDocument';

function newShareId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/** writeToken = HKDF-SHA-256(ikm = link key, salt = empty, info = "pt-checkin-write", 32 bytes). */
async function writeToken(key: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('pt-checkin-write') }, ikm, 256),
  );
}

async function checkinKeyHeader(key: Uint8Array): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(await writeToken(key)))));
}

async function publish(h: Harness, token: string, shareId: string, key: Uint8Array, body?: Uint8Array): Promise<Response> {
  const data = body ?? (await sealWithKey(key, new TextEncoder().encode(JSON.stringify(SAMPLE_DOCUMENT))));
  return h.authed(`/api/share/${shareId}`, token, {
    method: 'PUT',
    body: data,
    headers: { 'Content-Length': String(data.length), 'X-Checkin-Key': await checkinKeyHeader(key) },
  });
}

async function postCheckin(h: Harness, shareId: string, key: Uint8Array, ip: string, body?: Uint8Array): Promise<Response> {
  const doc = { v: 1, kind: 'checkin', createdAt: h.clock.now, weightKg: 71.5, notes: 'تمام' };
  const data = body ?? (await sealWithKey(key, new TextEncoder().encode(JSON.stringify(doc))));
  return h.send(`/api/share/${shareId}/checkins`, {
    method: 'POST',
    body: data,
    ip,
    headers: { 'Content-Length': String(data.length), 'X-Checkin-Token': base64UrlEncode(await writeToken(key)) },
  });
}

describe('share auth', () => {
  it('requires an approved account on every owner endpoint, and refuses other accounts', async () => {
    const h = await harness();
    const owner = await h.account();
    const other = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    expect((await publish(h, owner, shareId, key)).status).toBe(200);

    const calls: Array<[string, string]> = [
      ['PUT', `/api/share/${shareId}`],
      ['DELETE', `/api/share/${shareId}`],
      ['GET', `/api/share/${shareId}/checkins`],
      ['GET', `/api/share/${shareId}/checkins/AAAAAAAAAAAAAAAAAAAAAA`],
      ['DELETE', `/api/share/${shareId}/checkins/AAAAAAAAAAAAAAAAAAAAAA`],
      ['GET', '/api/checkins'],
    ];
    for (const [method, path] of calls) {
      expect((await h.send(path, { method })).status, `${method} ${path}`).toBe(401);
    }
    for (const [method, path] of calls.slice(0, 5)) {
      const init: RequestInit = method === 'PUT' ? { method, body: envelopeBytes('PTK1', 64), headers: { 'Content-Length': '64', 'X-Checkin-Key': 'A'.repeat(43) } } : { method };
      const res = await h.authed(path, other, init);
      expect([res.status, await readJson(res)], `${method} ${path}`).toEqual([403, { error: 'forbidden' }]);
    }
    await h.disable(other);
    for (const [method, path] of calls) {
      const res = await h.authed(path, other, { method });
      expect([res.status, await readJson(res)], `${method} ${path}`).toEqual([403, { error: 'disabled' }]);
    }
  });
});

describe('client page content', () => {
  it('publishes, serves the envelope publicly (decryptable with the link key), and supports ETag', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    const res = await publish(h, token, shareId, key);
    expect(await readJson(res)).toMatchObject({ shareId, updatedAt: h.clock.now });

    const got = await h.send(`/api/share/${shareId}`, { ip: freshIp() });
    expect(got.status).toBe(200);
    const opened = await openWithKey(key, new Uint8Array(await got.arrayBuffer()));
    expect(opened.ok && parseShareDocument(JSON.parse(new TextDecoder().decode(opened.data)))).toEqual(SAMPLE_DOCUMENT);

    const etag = got.headers.get('ETag') ?? '';
    const again = await h.send(`/api/share/${shareId}`, { ip: freshIp(), headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
  });

  it('refuses a missing check-in key, a non-PTK1 body and bodies over 5 MB', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    const noKey = await h.authed(`/api/share/${shareId}`, token, { method: 'PUT', body: envelopeBytes('PTK1', 64), headers: { 'Content-Length': '64' } });
    expect(noKey.status).toBe(400);
    expect(await readJson(await publish(h, token, shareId, generateRawKey(), envelopeBytes('PTP1', 64)))).toEqual({ error: 'bad_format' });
    const big = await publish(h, token, shareId, generateRawKey(), envelopeBytes('PTK1', 5 * 1024 * 1024 + 1));
    expect([big.status, await readJson(big)]).toEqual([413, { error: 'too_large', maxBytes: 5 * 1024 * 1024 }]);
    expect((await h.authed('/api/share/short', token, { method: 'PUT' })).status).toBe(404);
  });

  it('revoke: the page answers 404, blobs and check-ins are deleted, and the id cannot be reused', async () => {
    const h = await harness();
    const token = await h.account();
    const lid = await h.accountId(token);
    const shareId = newShareId();
    const key = generateRawKey();
    const before = await storedBytes();
    await publish(h, token, shareId, key);
    const posted = (await (await postCheckin(h, shareId, key, freshIp())).json()) as { id: string };
    expect(await storedBytes()).toBeGreaterThan(before);

    expect(await readJson(await h.authed(`/api/share/${shareId}`, token, { method: 'DELETE' }))).toEqual({ ok: true });
    expect((await h.send(`/api/share/${shareId}`, { ip: freshIp() })).status).toBe(404);
    expect(await env.BACKUPS.head(shareKey(lid, shareId))).toBeNull();
    expect(await env.BACKUPS.head(checkinKey(lid, shareId, posted.id))).toBeNull();
    expect(await storedBytes()).toBe(before);
    expect((await postCheckin(h, shareId, key, freshIp())).status).toBe(404);
    expect(await readJson(await publish(h, token, shareId, key))).toEqual({ error: 'revoked' });
  });

  it('answers storage_full when a new page would pass the global guard', async () => {
    const h = await harness({ cloudConfig: { storageGuardBytes: (await storedBytes()) + 100 } });
    const token = await h.account();
    const res = await publish(h, token, newShareId(), generateRawKey(), envelopeBytes('PTK1', 200));
    expect([res.status, await readJson(res)]).toEqual([507, { error: 'storage_full' }]);
  });

  it('rate-limits public reads per page id', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    await publish(h, token, shareId, generateRawKey());
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await h.send(`/api/share/${shareId}`, { ip: freshIp() })).status;
    expect(last).toBe(429);
  });
});

describe('check-ins', () => {
  it('accepts an encrypted check-in with the write token; the owner lists, downloads and deletes it', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    await publish(h, token, shareId, key);

    const wrong = await postCheckin(h, shareId, generateRawKey(), freshIp(), await sealWithKey(key, new Uint8Array(10)));
    expect([wrong.status, await readJson(wrong)]).toEqual([403, { error: 'forbidden' }]);

    const res = await postCheckin(h, shareId, key, freshIp());
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const list = await readJson(await h.authed(`/api/share/${shareId}/checkins`, token));
    expect(list).toEqual({ checkins: [{ id, shareId, createdAt: h.clock.now, size: expect.any(Number) }] });
    expect(((await readJson(await h.authed('/api/checkins', token))).checkins as unknown[]).length).toBe(1);

    const blob = await h.authed(`/api/share/${shareId}/checkins/${id}`, token);
    const opened = await openWithKey(key, new Uint8Array(await blob.arrayBuffer()));
    const doc = opened.ok ? parseCheckinDocument(JSON.parse(new TextDecoder().decode(opened.data))) : null;
    expect(doc).toMatchObject({ kind: 'checkin', weightKg: 71.5 });

    expect(await readJson(await h.authed(`/api/share/${shareId}/checkins/${id}`, token, { method: 'DELETE' }))).toEqual({ ok: true });
    expect(await readJson(await h.authed(`/api/share/${shareId}/checkins`, token))).toEqual({ checkins: [] });
  });

  it('refuses non-PTK1 bodies and bodies over 3 MB', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    await publish(h, token, shareId, key);
    expect(await readJson(await postCheckin(h, shareId, key, freshIp(), envelopeBytes('PTP1', 100)))).toEqual({ error: 'bad_format' });
    expect((await postCheckin(h, shareId, key, freshIp(), envelopeBytes('PTK1', 3 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it('caps pending check-ins per page', async () => {
    const h = await harness({ cloudConfig: { maxPendingCheckins: 3 } });
    const token = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    await publish(h, token, shareId, key);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await postCheckin(h, shareId, key, freshIp())).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
    expect(await readJson(await postCheckin(h, shareId, key, freshIp()))).toEqual({ error: 'too_many_pending' });
  });

  it('rate-limits check-ins strictly per IP (6 / hour) and per page (10 / day)', async () => {
    const h = await harness();
    const token = await h.account();
    const shareId = newShareId();
    const key = generateRawKey();
    await publish(h, token, shareId, key);
    const ip = freshIp();
    const fromOneIp: number[] = [];
    for (let i = 0; i < 7; i++) fromOneIp.push((await postCheckin(h, shareId, key, ip, envelopeBytes('PTP1', 10))).status);
    expect(fromOneIp.slice(0, 6).every((s) => s === 400)).toBe(true); // reached the handler (bad body)
    expect(fromOneIp[6]).toBe(429);

    const otherShare = newShareId();
    await publish(h, token, otherShare, key);
    const perPage: number[] = [];
    for (let i = 0; i < 11; i++) perPage.push((await postCheckin(h, otherShare, key, freshIp(), envelopeBytes('PTP1', 10))).status);
    expect(perPage[9]).toBe(400);
    expect(perPage[10]).toBe(429);
  });
});

describe('viewer page /c/:shareId', () => {
  it('serves a self-contained RTL page with a strict nonce CSP and no third-party sources', async () => {
    const h = await harness();
    const shareId = newShareId();
    const res = await h.send(`/c/${shareId}`);
    expect(res.status).toBe(200);
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    const nonce = /script-src 'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    const html = await res.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`data-share="${shareId}"`);
    expect(html).toContain('data-img="https://app.example/exercise-pack/img/"');
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|https?:\/\/(?!app\.example|www\.w3\.org\/2000\/svg')[a-z]/i); // the SVG namespace is an identifier, not a request

    const second = await h.send(`/c/${shareId}`);
    expect(second.headers.get('Content-Security-Policy')).not.toBe(csp); // fresh nonce per response
    expect((await h.send('/c/not-an-id')).status).toBe(404);
  });

  it('uses no forbidden (literal-translation) gym words', async () => {
    const h = await harness();
    const html = await (await h.send(`/c/${newShareId()}`)).text();
    expect(findForbiddenTerms(html + VIEWER_SCRIPT)).toEqual([]);
  });
});

describe('share document guard', () => {
  it('accepts the sample and rejects malformed documents', () => {
    expect(parseShareDocument(SAMPLE_DOCUMENT)).toEqual(SAMPLE_DOCUMENT);
    const bad: unknown[] = [
      null,
      { ...SAMPLE_DOCUMENT, v: 2 },
      { ...SAMPLE_DOCUMENT, brand: { name: 'x', color: 'red' } },
      { ...SAMPLE_DOCUMENT, brand: { name: 'x', color: '#000000', logo: 'https://evil.example/x.png' } },
      { ...SAMPLE_DOCUMENT, days: [{ title: 'd', exercises: [{ name: 'x', image: '../secret' }] }] },
      { ...SAMPLE_DOCUMENT, days: [{ title: 'd', exercises: [{ name: 'x', image: 'a/b.webp' }] }] },
      { ...SAMPLE_DOCUMENT, days: [{ title: 'd', exercises: [{ name: 'x', rpe: 11 }] }] },
      { ...SAMPLE_DOCUMENT, client: { firstName: 'x'.repeat(41) } },
      { ...SAMPLE_DOCUMENT, checkinsEnabled: 'yes' },
      { ...SAMPLE_DOCUMENT, progress: [{ key: 'iq', points: [] }] },
      { ...SAMPLE_DOCUMENT, progress: [{ key: 'weight', points: [{ d: 'yesterday', v: 70 }] }] },
      { ...SAMPLE_DOCUMENT, days: [{ title: 'd', exercises: [{ name: 'x', image2: '../x' }] }] },
      { ...SAMPLE_DOCUMENT, mealDays: [{ title: 'd', meals: [{ title: '', items: [] }] }] },
      { ...SAMPLE_DOCUMENT, sessions: [{ at: 'soon', durationMin: 60 }] },
      { ...SAMPLE_DOCUMENT, package: { left: 1 } },
      { ...SAMPLE_DOCUMENT, nextDay: 99 },
      { ...SAMPLE_DOCUMENT, streakWeeks: -1 },
      { ...SAMPLE_DOCUMENT, checkins: [{ d: '2026-01-01', weightKg: 5 }] },
      { ...SAMPLE_DOCUMENT, checkins: Array.from({ length: 13 }, () => ({ d: '2026-01-01' })) },
      { ...SAMPLE_DOCUMENT, startDate: 'today' },
    ];
    const { goal: _g, targets: _t, mealDays: _m, progress: _p, records: _r, sessions: _s, package: _k, attended: _a, nextDay: _n, streakWeeks: _w, checkins: _c, startDate: _d, ...minimal } = SAMPLE_DOCUMENT;
    expect(parseShareDocument(minimal)).toEqual(minimal); // older apps send only the original fields
    for (const doc of bad) expect(parseShareDocument(doc)).toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, photo: 'data:image/png;base64,AAAA' })).toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, weightKg: 80, photo: 'data:image/jpeg;base64,AAAA' })).not.toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, photos: ['data:image/jpeg;base64,AAAA'], hipCm: 95, armCm: 32 })).not.toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, photos: ['data:image/png;base64,AAAA'] })).toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, sleepHours: 7.5, energy: 4, adherence: 80 })).not.toBeNull();
    for (const bad of [{ energy: 0 }, { energy: 3.5 }, { adherence: 120 }, { sleepHours: 30 }]) {
      expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, ...bad })).toBeNull();
    }
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, armCm: 500 })).toBeNull();
    expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, neckCm: 38, mealPicks: [{ id: 'm1', o: 2 }, { id: 'm_2-x', o: 0 }] })).not.toBeNull();
    for (const bad of [{ neckCm: 5 }, { mealPicks: [{ id: 'm1', o: 4 }] }, { mealPicks: [{ id: 'm1', o: 1.5 }] }, { mealPicks: [{ id: 'سارة', o: 1 }] }, { mealPicks: [{ o: 1 }] }, { mealPicks: 'm1' }]) {
      expect(parseCheckinDocument({ v: 1, kind: 'checkin', createdAt: 1, ...bad })).toBeNull();
    }
    expect(parseShareDocument({ ...SAMPLE_DOCUMENT, meals: [{ id: 'm1', title: 'الفطار', items: ['فول'] }] })).not.toBeNull();
    expect(parseShareDocument({ ...SAMPLE_DOCUMENT, meals: [{ id: 'bad id', title: 'الفطار', items: ['فول'] }] })).toBeNull();
  });
});

describe('client page language', () => {
  it('accepts lang en/ar and rejects other values', () => {
    expect(parseShareDocument({ ...SAMPLE_DOCUMENT, lang: 'en' })).not.toBeNull();
    expect(parseShareDocument({ ...SAMPLE_DOCUMENT, lang: 'ar' })).not.toBeNull();
    expect(parseShareDocument({ ...SAMPLE_DOCUMENT, lang: 'fr' })).toBeNull();
  });
  it('has an English label for every Arabic viewer label', () => {
    const block = (name: string) => {
      const start = VIEWER_SCRIPT.indexOf(`var ${name} = {`);
      const end = VIEWER_SCRIPT.indexOf('\n};', start);
      return VIEWER_SCRIPT.slice(start, end);
    };
    const keys = (b: string) => [...b.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort();
    const ar = keys(block('AR'));
    expect(ar.length).toBeGreaterThan(50);
    expect(keys(block('EN'))).toEqual(ar);
    expect(block('EN')).not.toMatch(/[؀-ۿ]/);
    expect(VIEWER_SCRIPT).toContain("document.documentElement.dir = en ? 'ltr' : 'rtl'");
  });
});
