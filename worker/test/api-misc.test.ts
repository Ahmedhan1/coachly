import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { deviceFingerprint, hexToBytes, signLicense } from '../../shared/license';
import { createServerCrypto, ConfigError } from '../src/serverCrypto';
import { MemoryRateLimiter } from '../src/rateLimit';
import { harness, readJson } from './helpers';
import { TEST_APP_ORIGIN, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './fixtures';

const DEVICE = '0f0e0d0c-0b0a-4908-8706-050403020100';

describe('GET /api/license/status', () => {
  it('answers 401 without a valid signed token', async () => {
    const h = await harness();
    expect((await h.send('/api/license/status')).status).toBe(401);
    const res = await h.send('/api/license/status', { headers: { Authorization: 'Bearer abc.def' } });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'invalid' });
  });

  it('reports an active license and an offline-issued license (not in D1) as not revoked', async () => {
    const h = await harness();
    const code = await h.issueCode();
    const license = String((await readJson(await h.activate(code, DEVICE))).license);
    expect(await readJson(await h.send('/api/license/status', { headers: { Authorization: `Bearer ${license}` } }))).toEqual({ revoked: false });

    const offline = await signLicense(
      { v: 1, lid: 'offline-1', dev: await deviceFingerprint(DEVICE), name: 'x', iat: 1, actBy: 2, exp: null, feat: ['core'] },
      hexToBytes(TEST_PRIVATE_KEY) ?? new Uint8Array(),
    );
    expect(await readJson(await h.send('/api/license/status', { headers: { Authorization: `Bearer ${offline}` } }))).toEqual({ revoked: false });
  });

  it('is rate limited', async () => {
    const h = await harness();
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await h.send('/api/license/status')).status;
    expect(last).toBe(429);
  });
});

describe('CORS', () => {
  it('allows the configured app origin and answers preflight', async () => {
    const h = await harness();
    const pre = await h.send('/api/activate', { method: 'OPTIONS', headers: { Origin: TEST_APP_ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');

    const res = await h.send('/api/license/status', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('refuses other origins', async () => {
    const h = await harness();
    const res = await h.send('/api/activate', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('other routes and configuration', () => {
  it('answers 404 JSON for unknown paths', async () => {
    const h = await harness();
    const res = await h.send('/nothing');
    expect(res.status).toBe(404);
  });

  it('refuses to start with bad secrets', async () => {
    await expect(createServerCrypto({ privateKeyHex: 'zz', publicKeyHex: TEST_PUBLIC_KEY, adminPassword: 'long enough password' })).rejects.toBeInstanceOf(ConfigError);
    await expect(createServerCrypto({ privateKeyHex: TEST_PRIVATE_KEY, publicKeyHex: TEST_PUBLIC_KEY, adminPassword: 'short' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('the deployed entry point serves the admin login page', async () => {
    expect(env.DB).toBeDefined();
    const res = await exports.default.fetch(new Request('https://license.example/admin'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('لوحة الأكواد');
  });
});

describe('MemoryRateLimiter', () => {
  it('counts per window and resets in the next window', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { name: 't', limit: 2, windowSeconds: 60 };
    expect(await limiter.hit(rule, 'k', 120)).toBe(true);
    expect(await limiter.hit(rule, 'k', 130)).toBe(true);
    expect(await limiter.hit(rule, 'k', 140)).toBe(false);
    expect(await limiter.hit(rule, 'other', 140)).toBe(true);
    expect(await limiter.hit(rule, 'k', 180)).toBe(true);
  });
});
