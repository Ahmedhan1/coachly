import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createServerCrypto, ConfigError } from '../src/serverCrypto';
import { MemoryRateLimiter } from '../src/rateLimit';
import { harness } from './helpers';
import { TEST_APP_ORIGIN, TEST_AUTH_SECRET } from './fixtures';

describe('CORS', () => {
  it('allows the configured app origin and answers preflight', async () => {
    const h = await harness();
    const pre = await h.send('/api/auth/sign-in/email', { method: 'OPTIONS', headers: { Origin: TEST_APP_ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');

    const res = await h.send('/api/account', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('refuses other origins', async () => {
    const h = await harness();
    const res = await h.send('/api/auth/sign-in/email', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
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
    await expect(createServerCrypto({ authSecret: 'too short', adminPassword: 'long enough password' })).rejects.toBeInstanceOf(ConfigError);
    await expect(createServerCrypto({ authSecret: TEST_AUTH_SECRET, adminPassword: 'short' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('the deployed entry point serves the admin login page', async () => {
    expect(env.DB).toBeDefined();
    const res = await exports.default.fetch(new Request('https://license.example/admin'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('لوحة الحسابات');
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
