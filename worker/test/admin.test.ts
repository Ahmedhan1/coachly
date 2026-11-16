import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { decodeLicenseToken, normalizeShortCode } from '../../shared/license';
import { BASE, DAY, extractCode, freshIp, harness, readJson } from './helpers';

const DEVICE_A = '11111111-2222-4333-8444-555555555555';
const DEVICE_B = '66666666-7777-4888-9999-000000000000';

describe('/admin', () => {
  it('shows the login page without a session and redirects protected actions', async () => {
    const h = await harness();
    const page = await h.send('/admin');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('name="password"');
    expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");

    const res = await h.form('/admin/codes', '', { name: 'x', duration: 'lifetime', window: '14' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/admin');
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
    const res = await h.send('/admin/codes', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=x&duration=lifetime&window=14',
    });
    expect(res.status).toBe(403);
  });

  it('generates a code once, shows it formatted, and lists the customer with status', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.form('/admin/codes', cookie, { name: '<b>كابتن</b> علي', duration: '365', window: '7' });
    expect(res.status).toBe(200);
    const html = await res.text();
    const code = extractCode(html);
    expect(normalizeShortCode(code)).not.toBeNull();
    expect(html).not.toContain('<b>كابتن</b>'); // escaped

    const dashboard = await (await h.send('/admin', { headers: { Cookie: cookie } })).text();
    expect(dashboard).toContain('&#60;b&#62;كابتن&#60;/b&#62; علي');
    expect(dashboard).toContain('لسه ما اتفعلش');
    expect(dashboard).toContain('سنة');
    expect(dashboard).not.toContain(code); // shown once only
  });

  it('validates the generate form', async () => {
    const h = await harness();
    const cookie = await h.login();
    for (const fields of [
      { name: '', duration: 'lifetime', window: '14' },
      { name: 'x', duration: '12', window: '14' },
      { name: 'x', duration: 'lifetime', window: '0' },
      { name: 'x'.repeat(101), duration: 'lifetime', window: '14' },
    ]) {
      expect((await h.form('/admin/codes', cookie, fields)).status).toBe(400);
    }
  });

  it('revokes after confirmation; status then reports revoked and the code no longer activates', async () => {
    const h = await harness();
    const cookie = await h.login();
    const code = await h.issueCode({ name: 'كابتن ملغي' });
    const license = String((await readJson(await h.activate(code, DEVICE_A))).license);
    const lid = decodeLicenseToken(license)?.payload.lid ?? '';

    const confirm = await h.form('/admin/licenses/revoke', cookie, { lid });
    expect(await confirm.text()).toContain('name="confirmed" value="yes"');
    expect((await env.DB.prepare('SELECT status FROM licenses WHERE lid = ?').bind(lid).first<{ status: string }>())?.status).toBe('active');

    const done = await h.form('/admin/licenses/revoke', cookie, { lid, confirmed: 'yes' });
    expect(done.status).toBe(303);

    const status = await h.send('/api/license/status', { headers: { Authorization: `Bearer ${license}` } });
    expect(await readJson(status)).toEqual({ revoked: true });
    expect(await readJson(await h.activate(code, DEVICE_A))).toEqual({ error: 'invalid' });
  });

  it('moves a license to a new device: old device revoked, new code keeps the original expiry', async () => {
    const h = await harness();
    const cookie = await h.login();
    const code = await h.issueCode({ name: 'كابتن نقل', duration: '365' });
    const oldLicense = String((await readJson(await h.activate(code, DEVICE_A))).license);
    const old = decodeLicenseToken(oldLicense)?.payload;

    h.clock.now += 2 * 60 * 60;
    const res = await h.form('/admin/licenses/move', cookie, { lid: old?.lid ?? '', confirmed: 'yes', window: '14' });
    expect(res.status).toBe(200);
    const newCode = extractCode(await res.text());

    const status = await h.send('/api/license/status', { headers: { Authorization: `Bearer ${oldLicense}` } });
    expect(await readJson(status)).toEqual({ revoked: true });

    h.clock.now += DAY;
    const fresh = decodeLicenseToken(String((await readJson(await h.activate(newCode, DEVICE_B, freshIp()))).license))?.payload;
    expect(fresh?.exp).toBe(old?.exp);
    expect(fresh?.name).toBe('كابتن نقل');
    expect(fresh?.lid).not.toBe(old?.lid);
  });

  it('answers 404 for unknown licenses and 409 for licenses already ended', async () => {
    const h = await harness();
    const cookie = await h.login();
    expect((await h.form('/admin/licenses/revoke', cookie, { lid: 'nope', confirmed: 'yes' })).status).toBe(404);
    await h.issueCode({ name: 'كابتن مرتين' });
    const row = await env.DB.prepare('SELECT lid FROM licenses WHERE customer_name = ?').bind('كابتن مرتين').first<{ lid: string }>();
    const lid = row?.lid ?? '';
    await h.form('/admin/licenses/revoke', cookie, { lid, confirmed: 'yes' });
    expect((await h.form('/admin/licenses/revoke', cookie, { lid, confirmed: 'yes' })).status).toBe(409);
  });

  it('logs out by clearing the cookie', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.send('/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: BASE } });
    expect(res.status).toBe(303);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
