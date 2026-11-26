import { describe, expect, it } from 'vitest';
import { envelopeBytes, harness, readJson, type Harness } from './helpers';

async function setPlan(h: Harness, token: string, fields: Record<string, string>): Promise<Response> {
  const id = await h.accountId(token);
  return h.form('/admin/accounts/plan', await h.login(), { id, kind: 'trainer', gymName: '', maxClients: '', maxTrainers: '', until: '', ...fields });
}

async function account(h: Harness, token: string): Promise<Record<string, unknown>> {
  return (await readJson(await h.authed('/api/account', token))).account as Record<string, unknown>;
}

const post = (h: Harness, path: string, token: string, body: unknown) =>
  h.authed(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** An approved gym manager with an open invite code. */
async function gym(h: Harness, fields: Record<string, string> = {}) {
  const manager = await h.account('مدير جيم');
  expect((await setPlan(h, manager, { kind: 'gym', gymName: 'جيم الأبطال', maxClients: '30', maxTrainers: '1', until: '2030-01-01', ...fields })).status).toBe(303);
  const invite = await readJson(await post(h, '/api/team/invite', manager, {}));
  return { manager, code: String(invite.code) };
}

describe('owner plans (/admin/accounts/plan)', () => {
  it('validates the form and shows the plan on the dashboard', async () => {
    const h = await harness();
    const token = await h.account('كابتن خطة');
    expect((await setPlan(h, token, { maxClients: '-1' })).status).toBe(400);
    expect((await setPlan(h, token, { until: '2030-02-30' })).status).toBe(400);
    expect((await setPlan(h, token, { kind: 'gym', gymName: '' })).status).toBe(400);
    expect((await setPlan(h, token, { maxClients: '25', until: '2030-01-01' })).status).toBe(303);
    expect(await account(h, token)).toMatchObject({ status: 'approved', role: 'trainer', plan: { maxClients: 25, maxTrainers: null }, gym: null });
    const page = await (await h.send('/admin?q=' + encodeURIComponent('كابتن خطة'), { headers: { Cookie: await h.login() } })).text();
    expect(page).toContain('عملاء لكل مدرب: <span class="ltr">25</span>');
    const form = await (await h.send(`/admin/accounts/plan?id=${await h.accountId(token)}`, { headers: { Cookie: await h.login() } })).text();
    expect(form).toContain('value="2030-01-01"');
  });

  it('an approved account past its end date is expired: the app is told, cloud calls are refused', async () => {
    const h = await harness();
    const token = await h.account();
    await setPlan(h, token, { until: '2020-01-01' });
    expect(await account(h, token)).toMatchObject({ status: 'expired' });
    const res = await h.authed('/api/backup', token, { method: 'GET' });
    expect([res.status, await readJson(res)]).toEqual([403, { error: 'expired' }]);
  });
});

describe('gym teams', () => {
  it('a gym manager sees their gym in /api/account', async () => {
    const h = await harness();
    const { manager } = await gym(h);
    expect(await account(h, manager)).toMatchObject({ role: 'gym', plan: { maxClients: 30, maxTrainers: 1 }, gym: { name: 'جيم الأبطال', membership: 'owner' } });
  });

  it('invite → join (pending) → gym approves → the trainer works under the gym plan', async () => {
    const h = await harness();
    const { manager, code } = await gym(h);
    const trainer = (await h.signUp({ name: 'كابتن جديد' })).token;

    expect(await readJson(await post(h, '/api/team/join', trainer, { code }))).toEqual({ gym: { id: await h.accountId(manager), name: 'جيم الأبطال' } });
    expect(await account(h, trainer)).toMatchObject({ status: 'pending', gym: { name: 'جيم الأبطال', membership: 'pending' } });
    expect((await h.authed('/api/backup', trainer, { method: 'HEAD' })).status).toBe(403);

    const team = await readJson(await h.authed('/api/team', manager));
    expect(team.members).toMatchObject([{ name: 'كابتن جديد', status: 'pending', rosterAt: null }]);
    const trainerId = await h.accountId(trainer);
    expect((await post(h, `/api/team/members/${trainerId}`, manager, { action: 'approve' })).status).toBe(200);
    expect(await account(h, trainer)).toMatchObject({ status: 'approved', role: 'trainer', plan: { maxClients: 30, maxTrainers: null }, gym: { membership: 'active' } });
    expect((await h.authed('/api/backup', trainer, { method: 'HEAD' })).status).toBe(404);
  });

  it('enforces the gym trainer limit', async () => {
    const h = await harness();
    const { manager, code } = await gym(h, { maxTrainers: '1' });
    const a = (await h.signUp()).token;
    const b = (await h.signUp()).token;
    await post(h, '/api/team/join', a, { code });
    await post(h, '/api/team/join', b, { code });
    expect((await post(h, `/api/team/members/${await h.accountId(a)}`, manager, { action: 'approve' })).status).toBe(200);
    const second = await post(h, `/api/team/members/${await h.accountId(b)}`, manager, { action: 'approve' });
    expect([second.status, await readJson(second)]).toEqual([409, { error: 'trainer_limit' }]);
  });

  it('encrypted rosters: active trainers upload, only their gym manager reads; plain bytes refused', async () => {
    const h = await harness();
    const { manager, code } = await gym(h);
    const trainer = (await h.signUp()).token;
    await post(h, '/api/team/join', trainer, { code });
    const put = (token: string, body: Uint8Array) =>
      h.authed('/api/team/roster', token, { method: 'PUT', body, headers: { 'Content-Length': String(body.length) } });
    expect((await put(trainer, envelopeBytes('PTK1', 64))).status).toBe(403); // still pending
    await post(h, `/api/team/members/${await h.accountId(trainer)}`, manager, { action: 'approve' });
    expect((await put(trainer, new TextEncoder().encode('plain client names, not encrypted at all'))).status).toBe(400);
    expect((await put(trainer, envelopeBytes('PTK1', 300 * 1024))).status).toBe(413);
    expect((await put(trainer, envelopeBytes('PTK1', 64, 9))).status).toBe(200);
    expect((await put(manager, envelopeBytes('PTK1', 48, 5))).status).toBe(200);

    const { rosters } = await readJson(await h.authed('/api/team/rosters', manager));
    expect(rosters).toHaveLength(2);
    const outsider = await h.account();
    expect((await h.authed('/api/team/rosters', outsider)).status).toBe(403);
    expect((await put(outsider, envelopeBytes('PTK1', 64))).status).toBe(409);
  });

  it('a new invite code replaces the old one; bad codes and own gym are refused', async () => {
    const h = await harness();
    const { manager, code } = await gym(h);
    await post(h, '/api/team/invite', manager, {});
    const trainer = (await h.signUp()).token;
    expect((await post(h, '/api/team/join', trainer, { code })).status).toBe(404);
    expect((await post(h, '/api/team/join', trainer, { code: 'x' })).status).toBe(404);
    const fresh = String((await readJson(await post(h, '/api/team/invite', manager, {}))).code);
    expect((await post(h, '/api/team/join', manager, { code: fresh })).status).toBe(409);
  });

  it('removing a trainer cuts their access and deletes their roster; disabling or ending the gym cuts its trainers', async () => {
    const h = await harness();
    const { manager, code } = await gym(h, { maxTrainers: '' });
    const join = async () => {
      const t = (await h.signUp()).token;
      await post(h, '/api/team/join', t, { code });
      await post(h, `/api/team/members/${await h.accountId(t)}`, manager, { action: 'approve' });
      return t;
    };
    const removed = await join();
    await post(h, `/api/team/members/${await h.accountId(removed)}`, manager, { action: 'remove' });
    expect(await account(h, removed)).toMatchObject({ status: 'disabled', gym: null });

    const kept = await join();
    expect((await account(h, kept)).status).toBe('approved');
    await setPlan(h, manager, { kind: 'gym', gymName: 'جيم الأبطال', until: '2020-01-01' });
    expect((await account(h, kept)).status).toBe('expired');
    await setPlan(h, manager, { kind: 'gym', gymName: 'جيم الأبطال' });
    expect((await account(h, kept)).status).toBe('approved');
    await h.disable(manager);
    expect((await account(h, kept)).status).toBe('disabled');
  });

  it('a trainer can leave; only gym managers reach the team endpoints', async () => {
    const h = await harness();
    const { code } = await gym(h);
    const trainer = (await h.signUp()).token;
    await post(h, '/api/team/join', trainer, { code });
    expect((await post(h, '/api/team/leave', trainer, {})).status).toBe(200);
    expect((await account(h, trainer)).gym).toBeNull();
    const plain = await h.account();
    expect(await readJson(await h.authed('/api/team', plain))).toEqual({ error: 'not_gym' });
  });
});

describe('owner dashboard and gym trainers', () => {
  it('a gym trainer is shown as handled by the gym and does not count as waiting for the owner', async () => {
    const h = await harness();
    const { manager, code } = await gym(h, { gymName: 'جيم الأبطال' });
    const trainer = (await h.signUp({ name: 'كابتن تبع الجيم' })).token;
    await post(h, '/api/team/join', trainer, { code });
    const cookie = await h.login();
    const before = await (await h.send('/admin?q=' + encodeURIComponent('تبع الجيم'), { headers: { Cookie: cookie } })).text();
    expect(before).toContain('مستني موافقة الجيم');
    expect(before).not.toContain('>موافقة<');
    await post(h, `/api/team/members/${await h.accountId(trainer)}`, manager, { action: 'approve' });
    const after = await (await h.send('/admin?q=' + encodeURIComponent('تبع الجيم'), { headers: { Cookie: cookie } })).text();
    expect(after).toContain('شغّال (عن طريق الجيم)');
  });
});
