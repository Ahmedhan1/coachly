import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { decodeLicenseToken, normalizeShortCode } from '../../shared/license';
import { BASE, DAY, extractCode, followIssued, freshIp, harness, readJson } from './helpers';

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
    expect(res.status).toBe(303);
    const html = await (await followIssued(h.send, res, cookie)).text();
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
    expect(res.status).toBe(303);
    const newCode = extractCode(await (await followIssued(h.send, res, cookie)).text());

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

  it('Post/Redirect/Get: refreshing the result shows the same code and issues nothing new', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.form('/admin/codes', cookie, { name: 'كابتن ريفرش', duration: 'lifetime', window: '14' });
    const first = await (await followIssued(h.send, res, cookie)).text();
    const again = await (await followIssued(h.send, res, cookie)).text();
    expect(extractCode(again)).toBe(extractCode(first));
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM licenses WHERE customer_name = ?').bind('كابتن ريفرش').first<{ n: number }>();
    expect(rows?.n).toBe(1);

    // The one-time view expires; a tampered cookie is refused.
    const issued = (res.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    const tampered = await h.send('/admin/issued', { headers: { Cookie: `${cookie}; ${issued.slice(0, -2)}xx` } });
    expect(tampered.status).toBe(410);
    h.clock.now += 31 * 60;
    expect((await followIssued(h.send, res, cookie)).status).toBe(410);
  });

  it('shows copy buttons and a WhatsApp message with the app link, the code and 3 install steps', async () => {
    const h = await harness();
    const cookie = await h.login();
    const res = await h.form('/admin/codes', cookie, { name: 'كابتن واتساب', duration: 'lifetime', window: '14' });
    const page = await followIssued(h.send, res, cookie);
    expect(page.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    const html = await page.text();
    const code = extractCode(html);
    expect(html).toContain('data-copy="code"');
    expect(html).toContain('data-copy="msg"');
    const wa = /href="(https:\/\/wa\.me\/\?text=[^"]+)"/.exec(html)?.[1] ?? '';
    const text = decodeURIComponent(wa.replace('https://wa.me/?text=', '').replace(/&#38;/g, '&'));
    expect(text).toContain('https://app.example');
    expect(text).toContain(code);
    expect(text).toContain('1. ');
    expect(text).toContain('2. ');
    expect(text).toContain('3. ');
    expect(text).toContain('Safari');
    expect(text).toContain('Chrome');
    const script = await h.send('/admin/admin.js');
    expect(script.headers.get('Content-Type')).toContain('javascript');
    expect(await script.text()).toContain('execCommand');
  });

  it('searches by name, filters by status, pages long lists and shows the bound device', async () => {
    const h = await harness();
    const cookie = await h.login();
    for (let i = 0; i < 27; i++) await h.issueCode({ name: `كابتن صفحة ${i}` });
    const code = await h.issueCode({ name: 'كابتن مفعّل' });
    await h.activate(code, DEVICE_A);
    const get = async (query: string) => (await h.send(`/admin${query}`, { headers: { Cookie: cookie } })).text();

    const first = await get('?q=' + encodeURIComponent('كابتن صفحة'));
    expect(first).toContain('1 / 2');
    expect((first.match(/<tr><td/g) ?? []).length).toBe(25);
    const second = await get('?q=' + encodeURIComponent('كابتن صفحة') + '&page=2');
    expect((second.match(/<tr><td/g) ?? []).length).toBe(2);

    const active = await get('?status=active&q=' + encodeURIComponent('مفعّل'));
    expect(active).toContain('كابتن مفعّل');
    expect(active).toContain('شغّال');
    expect(active).toMatch(/data-label="الجهاز"><span class="ltr mono">[0-9a-f]{8}</);
    expect(await get('?q=' + encodeURIComponent('مش موجود خالص'))).toContain('مفيش نتايج');
  });

  it('tells the owner when the session ran out instead of silently showing the login', async () => {
    const h = await harness();
    const cookie = await h.login();
    h.clock.now += 13 * 60 * 60;
    const post = await h.form('/admin/codes', cookie, { name: 'x', duration: 'lifetime', window: '14' });
    expect(post.headers.get('Location')).toBe('/admin?expired=1');
    const login = await (await h.send('/admin', { headers: { Cookie: cookie } })).text();
    expect(login).toContain('الجلسة خلصت');
    expect(await (await h.send('/admin')).text()).not.toContain('الجلسة خلصت');
  });
});
