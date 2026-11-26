import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { freshIp, harness, readJson, TEST_PASSWORD } from './helpers';
import { TEST_APP_ORIGIN } from './fixtures';

const json = { 'Content-Type': 'application/json', Origin: TEST_APP_ORIGIN };

describe('email + password accounts', () => {
  it('a new account starts pending: /api/account says so and cloud endpoints answer 403 pending', async () => {
    const h = await harness();
    const { token } = await h.signUp({ name: 'كابتن جديد' });
    const res = await h.authed('/api/account', token);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ account: { name: 'كابتن جديد', status: 'pending' } });
    const backup = await h.authed('/api/backup', token, { method: 'GET' });
    expect([backup.status, await readJson(backup)]).toEqual([403, { error: 'pending' }]);
  });

  it('sign-up cannot set its own status', async () => {
    const h = await harness();
    const res = await h.send('/api/auth/sign-up/email', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'x', email: `self-${crypto.randomUUID()}@example.com`, password: TEST_PASSWORD, status: 'approved' }),
      ip: freshIp(),
    });
    const body = (await res.json()) as { token?: string };
    if (res.status === 200) {
      expect(await readJson(await h.authed('/api/account', body.token ?? ''))).toMatchObject({ account: { status: 'pending' } });
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('signs in with the right password only, and refuses a duplicate email', async () => {
    const h = await harness();
    const { email } = await h.signUp();
    const signIn = (password: string) =>
      h.send('/api/auth/sign-in/email', { method: 'POST', headers: json, body: JSON.stringify({ email, password }), ip: freshIp() });
    const ok = await signIn(TEST_PASSWORD);
    expect(ok.status).toBe(200);
    expect(typeof (await readJson(ok)).token).toBe('string');
    expect((await signIn('wrong password')).status).toBe(401);
    await expect(h.signUp({ email })).rejects.toThrow(/sign-up failed/);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const h = await harness();
    await expect(h.signUp({ password: 'short' })).rejects.toThrow(/sign-up failed/);
  });

  it('sign-out ends the session', async () => {
    const h = await harness();
    const token = await h.account();
    expect((await h.authed('/api/auth/sign-out', token, { method: 'POST', headers: json, body: '{}' })).status).toBe(200);
    expect((await h.authed('/api/account', token)).status).toBe(401);
  });

  it('/api/account answers 401 without or with a bad token', async () => {
    const h = await harness();
    expect((await h.send('/api/account')).status).toBe(401);
    expect((await h.authed('/api/account', 'nope')).status).toBe(401);
  });

  it('rate-limits sign-in attempts per IP (durable)', async () => {
    const h = await harness();
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await h.send('/api/auth/sign-in/email', { method: 'POST', headers: json, body: JSON.stringify({ email: 'a@b.c', password: 'x' }), ip })).status;
    }
    expect(last).toBe(429);
  });

  it('tells the app which sign-in methods exist', async () => {
    const h = await harness();
    expect(await readJson(await h.send('/api/auth-config'))).toEqual({ google: true });
  });

  it('hides better-auth endpoints the app does not use', async () => {
    const h = await harness();
    expect((await h.send('/api/auth/list-sessions')).status).toBe(404);
    expect((await h.send('/api/auth/one-time-token/generate')).status).toBe(404);
  });
});

describe('Google sign-in (redirect + one-time-token handoff)', () => {
  it('starts on this site: redirects to Google with our callback and sets the state cookie here', async () => {
    const h = await harness();
    const res = await h.send(`/auth/google?return=${encodeURIComponent(TEST_APP_ORIGIN)}`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe('https://license.example/api/auth/callback/google');
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it('hands the session to the app once: #auth=<one-time token>, cookie cleared, token single-use', async () => {
    const h = await harness();
    const email = `g-${crypto.randomUUID()}@example.com`;
    const signUp = await h.send('/api/auth/sign-up/email', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Google Trainer', email, password: TEST_PASSWORD }),
      ip: freshIp(),
    });
    const cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.includes('session_token'));
    expect(cookie).toBeDefined();

    const handoff = await h.send(`/auth/handoff?return=${encodeURIComponent(TEST_APP_ORIGIN)}`, { headers: { Cookie: cookie ?? '' } });
    expect(handoff.status).toBe(302);
    const location = handoff.headers.get('Location') ?? '';
    expect(location.startsWith(`${TEST_APP_ORIGIN}/#auth=`)).toBe(true);
    expect(handoff.headers.getSetCookie().some((c) => c.includes('session_token=;') && c.includes('Max-Age=0'))).toBe(true);

    const ott = new URLSearchParams(location.split('#')[1]).get('auth') ?? '';
    const verify = () => h.send('/api/auth/one-time-token/verify', { method: 'POST', headers: json, body: JSON.stringify({ token: ott }), ip: freshIp() });
    const first = await verify();
    expect(first.status).toBe(200);
    const body = (await first.json()) as { session: { token: string }; user: { email: string } };
    expect(body.user.email).toBe(email);
    expect(await readJson(await h.authed('/api/account', body.session.token))).toMatchObject({ account: { email, status: 'pending' } });
    expect((await verify()).status).toBe(400);
  });

  it('sends errors and unknown return origins back to the configured app', async () => {
    const h = await harness();
    const failed = await h.send('/auth/handoff?failed=1&return=https%3A%2F%2Fevil.example');
    expect(failed.headers.get('Location')).toBe(`${TEST_APP_ORIGIN}/#auth_error=google_failed`);
    const noSession = await h.send(`/auth/handoff?return=${encodeURIComponent(TEST_APP_ORIGIN)}`);
    expect(noSession.headers.get('Location')).toBe(`${TEST_APP_ORIGIN}/#auth_error=google_failed`);
  });
});

describe('accounts schema (migrations/0005_accounts.sql)', () => {
  it('has every column better-auth expects for our options', async () => {
    const h = await harness();
    // A full round-trip already ran above; here, check the status column default the approval flow relies on.
    const { userId } = await h.signUp();
    const row = await env.DB.prepare('SELECT status FROM "user" WHERE id = ?').bind(userId).first<{ status: string }>();
    expect(row?.status).toBe('pending');
    const cols = await env.DB.prepare('PRAGMA table_info("session")').all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).toEqual(['id', 'expiresAt', 'token', 'createdAt', 'updatedAt', 'ipAddress', 'userAgent', 'userId']);
  });
});
