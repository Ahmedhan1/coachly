import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { envelopeBytes, freshIp, harness, storedBytes } from './helpers';

async function r2Keys(prefix: string): Promise<string[]> {
  return (await env.BACKUPS.list({ prefix })).objects.map((o) => o.key);
}

describe('/admin delete account', () => {
  it('asks to type the email, then removes the account and everything it stored', async () => {
    const h = await harness();
    const { token, userId, email } = await h.signUp({ name: 'كابتن ممسوح' });
    await h.adminAction(token, 'approve');
    const cookie = await h.login();

    const backup = envelopeBytes('PTP1', 3000, 3);
    expect((await h.authed('/api/backup', token, { method: 'PUT', body: backup, headers: { 'Content-Length': '3000' } })).status).toBe(201);
    const file = envelopeBytes('PTK1', 1500, 9);
    expect((await h.authed('/api/files?kind=pdf', token, { method: 'POST', body: file, headers: { 'Content-Length': '1500' } })).status).toBe(201);
    const enc = encodeURIComponent(userId);
    expect((await r2Keys(`backups/${enc}/`)).length).toBe(1);
    expect((await r2Keys(`files/${enc}/`)).length).toBe(1);
    const before = await storedBytes();

    const ask = await h.form('/admin/accounts/delete', cookie, { id: userId });
    expect(ask.status).toBe(200);
    expect(await ask.text()).toContain('اكتب الإيميل');
    const wrong = await h.form('/admin/accounts/delete', cookie, { id: userId, confirmed: 'yes', email: 'someone@else.com' });
    expect(wrong.status).toBe(400);
    expect(await h.deps.accounts.find(userId)).not.toBeNull();

    const done = await h.form('/admin/accounts/delete', cookie, { id: userId, confirmed: 'yes', email: email.toUpperCase() });
    expect(done.headers.get('Location')).toBe('/admin?done=delete');
    expect(await h.deps.accounts.find(userId)).toBeNull();
    expect((await h.authed('/api/account', token, { ip: freshIp() })).status).toBe(401);
    expect(await r2Keys(`backups/${enc}/`)).toEqual([]);
    expect(await r2Keys(`files/${enc}/`)).toEqual([]);
    for (const [table, col] of [['backups', 'lid'], ['cloud_files', 'account'], ['account_plans', 'user_id'], ['"session"', '"userId"'], ['"account"', '"userId"']] as const) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).bind(userId).first<{ n: number }>();
      expect([table, row?.n]).toEqual([table, 0]);
    }
    expect(before - (await storedBytes())).toBe(3000 + 1500);
    const audit = await env.DB.prepare('SELECT action FROM audit_log WHERE lid = ? ORDER BY id DESC LIMIT 1').bind(userId).first<{ action: string }>();
    expect(audit?.action).toBe('deleted');
    // The account can sign up again with the same email afterwards.
    expect((await h.signUp({ email })).userId).not.toBe(userId);
  });

  it('deleting a gym releases its trainers and drops their rosters', async () => {
    const h = await harness();
    const gym = await h.signUp({ name: 'جيم ممسوح' });
    await h.adminAction(gym.token, 'approve');
    const cookie = await h.login();
    expect((await h.form('/admin/accounts/plan', cookie, { id: gym.userId, kind: 'gym', gymName: 'جيم ممسوح' })).status).toBe(303);
    const trainer = await h.signUp();
    await env.DB.prepare("INSERT INTO gym_members (user_id, gym_id, status, joined_at, updated_at) VALUES (?, ?, 'active', 1, 1)").bind(trainer.userId, gym.userId).run();
    const ask = await (await h.form('/admin/accounts/delete', cookie, { id: gym.userId })).text();
    expect(ask).toContain('الجيم نفسه');
    await h.form('/admin/accounts/delete', cookie, { id: gym.userId, confirmed: 'yes', email: gym.email });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM gym_members WHERE gym_id = ?').bind(gym.userId).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM gyms WHERE id = ?').bind(gym.userId).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await h.deps.accounts.find(trainer.userId)).not.toBeNull();
  });

  it('approves in place for the dashboard script and pages/searches in SQL', async () => {
    const h = await harness();
    const tag = crypto.randomUUID().slice(0, 8);
    const a = await h.signUp({ name: `inline ${tag}`, email: `inline-${tag}@example.com` });
    const cookie = await h.login();
    const res = await h.send('/admin/accounts/approve', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://license.example', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Admin-Inline': '1' },
      body: new URLSearchParams({ id: a.userId }).toString(),
    });
    expect(res.status).toBe(200);
    const card = await res.text();
    expect(card.startsWith('<article')).toBe(true);
    expect(card).toContain('شغّال');
    const found = await (await h.send(`/admin?q=${encodeURIComponent(`INLINE-${tag}`)}`, { headers: { Cookie: cookie } })).text();
    expect(found).toContain(`inline-${tag}@example.com`);
    const none = await (await h.send(`/admin?q=${encodeURIComponent('%_')}`, { headers: { Cookie: cookie } })).text();
    expect(none).toContain('مفيش نتايج');
  });
});
