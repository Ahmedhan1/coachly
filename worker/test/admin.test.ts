import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { BASE, freshIp, harness } from './helpers';

describe('/admin', () => {
  it('shows the login page without a session and redirects protected actions', async () => {
    const h = await harness();
    const page = await h.send('/admin');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('name="password"');
    expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");

    const res = await h.form('/admin/accounts/approve', '', { id: 'x' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/admin?expired=1');
  });

  it('sets a HttpOnly, Secure, SameSite=Strict session cookie on login', async () => {
    const h = await harness();
    const res = await h.send('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=test-admin-password',
    });
    expect(res.status).toBe(303);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-ptadmin=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
  });

  it('rejects a wrong password and rate-limits login attempts', async () => {
    const h = await harness();
    const attempt = () =>
      h.send('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=nope' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('rejects forged, tampered and expired session cookies', async () => {
    const h = await harness();
    const cookie = await h.login();
    const [name, value] = cookie.split('=');
    const [expiry, mac] = (value ?? '').split('.');
    const tampered = `${name}=${Number(expiry) + 100}.${mac}`;
    for (const bad of ['__Host-ptadmin=123.abc', tampered]) {
      const res = await h.send('/admin', { headers: { Cookie: bad } });
      expect(await res.text()).toContain('name="password"');
    }
    h.clock.now += 13 * 60 * 60;
    expect(await (await h.send('/admin', { headers: { Cookie: cookie } })).text()).toContain('name="password"');
  });

  it('refuses cross-origin form posts', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.send('/admin/accounts/approve', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'id=x',
    });
    expect(res.status).toBe(403);
  });

  it('logs out by clearing the cookie', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.send('/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: BASE } });
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('tells the owner when the session ran out instead of silently showing the login', async () => {
    const h = await harness();
    const cookie = await h.login();
    h.clock.now += 13 * 60 * 60;
    const post = await h.form('/admin/accounts/approve', cookie, { id: 'x' });
    expect(post.headers.get('Location')).toBe('/admin?expired=1');
    const login = await (await h.send('/admin', { headers: { Cookie: cookie } })).text();
    expect(login).toContain('الجلسة خلصت');
    expect(await (await h.send('/admin')).text()).not.toContain('الجلسة خلصت');
  });

  it('lists accounts with their status, counts the ones waiting, searches and filters', async () => {
    const h = await harness();
    const a = await h.signUp({ name: 'كابتن أحمد', email: `ahmed-${crypto.randomUUID()}@example.com` });
    const b = await h.signUp({ name: 'كابتن سارة' });
    await h.adminAction(b.token, 'approve');
    const cookie = await h.login();
    const page = await (await h.send('/admin', { headers: { Cookie: cookie } })).text();
    expect(page).toContain('لوحة الحسابات');
    expect(page).toContain('كابتن أحمد');
    expect(page).toContain(a.email);
    expect(page).toContain('مستني موافقتك');
    const pending = await (await h.send('/admin?status=pending', { headers: { Cookie: cookie } })).text();
    expect(pending).toContain('كابتن أحمد');
    expect(pending).not.toContain('كابتن سارة');
    const search = await (await h.send(`/admin?q=${encodeURIComponent('سارة')}`, { headers: { Cookie: cookie } })).text();
    expect(search).toContain('كابتن سارة');
    expect(search).not.toContain('كابتن أحمد');
  });

  it('approve, disable (after confirmation) and enable change what the account may do', async () => {
    const h = await harness();
    const { token, userId } = await h.signUp();
    const cookie = await h.login();
    expect((await h.authed('/api/backup', token, { method: 'HEAD' })).status).toBe(403);

    expect((await h.form('/admin/accounts/approve', cookie, { id: userId })).headers.get('Location')).toBe('/admin?done=approve');
    expect((await h.authed('/api/backup', token, { method: 'HEAD' })).status).toBe(404);

    const confirm = await h.form('/admin/accounts/disable', cookie, { id: userId });
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain('متأكد');
    expect((await h.authed('/api/backup', token, { method: 'HEAD' })).status).toBe(404);
    expect((await h.form('/admin/accounts/disable', cookie, { id: userId, confirmed: 'yes' })).status).toBe(303);
    const backup = await h.authed('/api/backup', token, { method: 'GET' });
    expect([backup.status, await backup.json()]).toEqual([403, { error: 'disabled' }]);
    expect(await (await h.authed('/api/account', token)).json()).toMatchObject({ account: { status: 'disabled' } });

    expect((await h.form('/admin/accounts/enable', cookie, { id: userId })).status).toBe(303);
    const audit = await env.DB.prepare('SELECT action FROM audit_log WHERE lid = ? ORDER BY id').bind(userId).all<{ action: string }>();
    expect(audit.results.map((r) => r.action)).toEqual(['approved', 'disabled', 'enabled']);
  });

  it('sets a new password: shown once, old sessions end, the trainer signs in with it', async () => {
    const h = await harness();
    const { token, userId, email } = await h.signUp();
    const cookie = await h.login();
    const confirm = await (await h.form('/admin/accounts/password', cookie, { id: userId })).text();
    expect(confirm).toContain('name="password"');
    expect((await h.form('/admin/accounts/password', cookie, { id: userId, confirmed: 'yes', password: 'short' })).status).toBe(400);
    const done = await h.form('/admin/accounts/password', cookie, { id: userId, confirmed: 'yes', password: 'new-pass-1234' });
    expect(done.status).toBe(200);
    const html = await done.text();
    expect(html).toContain('new-pass-1234');
    expect(html).toContain('wa.me');
    expect((await h.authed('/api/account', token)).status).toBe(401);
    const signIn = await h.send('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' },
      body: JSON.stringify({ email, password: 'new-pass-1234' }),
      ip: freshIp(),
    });
    expect(signIn.status).toBe(200);
  });

  it('answers 404 for unknown accounts', async () => {
    const h = await harness();
    const res = await h.form('/admin/accounts/approve', await h.login(), { id: 'nobody' });
    expect(res.status).toBe(404);
  });
});
