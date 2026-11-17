// "Move to new device" (admin dashboard) must carry the trainer's cloud data over to the new license:
// backups, client pages and pending check-ins follow the account (the root license id), the old license
// is shut out of everything, and the old device's push subscription is dropped.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { base64UrlEncode, decodeLicenseToken } from '../../shared/license';
import { envelopeBytes, extractCode, followIssued, freshIp, harness, readJson, storedBytes, type Harness } from './helpers';

const OLD_DEVICE_ONLY: Array<[string, string]> = [
  ['GET', '/api/backup'],
  ['HEAD', '/api/backup'],
  ['PUT', '/api/backup'],
  ['DELETE', '/api/backup'],
  ['POST', '/api/backup/uploads'],
  ['GET', '/api/checkins'],
  ['POST', '/api/push/subscribe'],
];

function lidOf(token: string): string {
  return decodeLicenseToken(token)?.payload.lid ?? '';
}

function put(h: Harness, token: string, body: Uint8Array): Promise<Response> {
  return h.authed('/api/backup', token, { method: 'PUT', body, headers: { 'Content-Length': String(body.length) } });
}

async function download(h: Harness, token: string, which = 'latest'): Promise<Uint8Array> {
  const res = await h.authed(`/api/backup?which=${which}`, token);
  expect(res.status).toBe(200);
  return new Uint8Array(await res.arrayBuffer());
}

/** Moves the license behind `token` to a new device through the dashboard and activates the new code there. */
async function move(h: Harness, token: string): Promise<string> {
  const cookie = await h.login();
  const res = await h.form('/admin/licenses/move', cookie, { lid: lidOf(token), confirmed: 'yes', window: '14' });
  const page = await followIssued(h.send, res, cookie);
  expect(page.status).toBe(200);
  const activation = await h.activate(extractCode(await page.text()), crypto.randomUUID(), freshIp());
  const body = (await activation.json()) as { license?: string };
  if (typeof body.license !== 'string') throw new Error(`activation failed: ${activation.status}`);
  return body.license;
}

function newShareId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/** A share whose check-in token we control (the hash header is all the Worker checks on PUT). */
async function publishShare(h: Harness, token: string, shareId: string, writeToken: Uint8Array): Promise<Response> {
  const hash = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(writeToken))));
  const body = envelopeBytes('PTK1', 256, 4);
  return h.authed(`/api/share/${shareId}`, token, {
    method: 'PUT',
    body,
    headers: { 'Content-Length': String(body.length), 'X-Checkin-Key': hash },
  });
}

function postCheckin(h: Harness, shareId: string, writeToken: Uint8Array): Promise<Response> {
  const body = envelopeBytes('PTK1', 128, 5);
  return h.send(`/api/share/${shareId}/checkins`, {
    method: 'POST',
    body,
    ip: freshIp(),
    headers: { 'Content-Length': String(body.length), 'X-Checkin-Token': base64UrlEncode(writeToken) },
  });
}

function pushSubscription(endpoint: string): string {
  const p256dh = new Uint8Array(65).fill(9);
  p256dh[0] = 4;
  return JSON.stringify({ subscription: { endpoint, keys: { p256dh: base64UrlEncode(p256dh), auth: base64UrlEncode(new Uint8Array(16).fill(3)) } } });
}

describe('move to new device: cloud backup follows the trainer', () => {
  it('lets the new license list and download the backups uploaded by the old one', async () => {
    const h = await harness();
    const oldToken = await h.license();
    const first = envelopeBytes('PTP1', 2048, 1);
    const second = envelopeBytes('PTP1', 3072, 2);
    expect((await put(h, oldToken, first)).status).toBe(201);
    h.clock.now += 60;
    expect((await put(h, oldToken, second)).status).toBe(201);
    const uploadedAt = h.clock.now;

    h.clock.now += 3600;
    const newToken = await move(h, oldToken);
    expect(lidOf(newToken)).not.toBe(lidOf(oldToken));

    const head = await h.authed('/api/backup', newToken, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('X-Backup-Size')).toBe('3072');
    expect(head.headers.get('X-Backup-Uploaded-At')).toBe(String(uploadedAt));
    expect(head.headers.get('X-Backup-Previous-Size')).toBe('2048');
    expect(await download(h, newToken)).toEqual(second);
    expect(await download(h, newToken, 'previous')).toEqual(first);
  });

  it('shuts the old license out of every cloud endpoint after the move', async () => {
    const h = await harness();
    const oldToken = await h.license();
    expect((await put(h, oldToken, envelopeBytes('PTP1', 1024))).status).toBe(201);
    const newToken = await move(h, oldToken);

    for (const [method, path] of OLD_DEVICE_ONLY) {
      const res = await h.authed(path, oldToken, { method });
      expect(res.status, `${method} ${path}`).toBe(403);
      if (method !== 'HEAD') expect(await readJson(res), `${method} ${path}`).toEqual({ error: 'revoked' });
    }
    const status = await h.authed('/api/license/status', oldToken);
    expect(await readJson(status)).toEqual({ revoked: true });
    // The data is still there for the new device.
    expect((await h.authed('/api/backup', newToken, { method: 'HEAD' })).status).toBe(200);
  });

  it('survives three successive moves; each device sees and extends the same history', async () => {
    const h = await harness();
    const a = await h.license();
    const fromA = envelopeBytes('PTP1', 1024, 1);
    expect((await put(h, a, fromA)).status).toBe(201);

    h.clock.now += 60;
    const b = await move(h, a);
    expect(await download(h, b)).toEqual(fromA);
    const fromB = envelopeBytes('PTP1', 1536, 2);
    expect(await readJson(await put(h, b, fromB))).toMatchObject({ size: 1536, previousKept: true });

    h.clock.now += 60;
    const c = await move(h, b);
    expect(await download(h, c)).toEqual(fromB);
    expect(await download(h, c, 'previous')).toEqual(fromA);

    h.clock.now += 60;
    const d = await move(h, c);
    expect(await download(h, d)).toEqual(fromB);
    const fromD = envelopeBytes('PTP1', 512, 4);
    expect(await readJson(await put(h, d, fromD))).toMatchObject({ size: 512, previousKept: true });
    expect(await download(h, d)).toEqual(fromD);
    expect(await download(h, d, 'previous')).toEqual(fromB);

    for (const old of [a, b, c]) expect((await h.authed('/api/backup', old)).status).toBe(403);
    // One trainer, one backup row: the chain shares the account id of the first license.
    const rows = await env.DB.prepare('SELECT lid FROM backups WHERE lid IN (?, ?, ?, ?)')
      .bind(lidOf(a), lidOf(b), lidOf(c), lidOf(d))
      .all<{ lid: string }>();
    expect(rows.results.map((r) => r.lid)).toEqual([lidOf(a)]);
  });

  it('keeps a multipart upload working on the new device and lets it delete the moved backup', async () => {
    const h = await harness({ cloudConfig: { singlePutMaxBytes: 1024, backupPartBytes: 5 * 1024 * 1024 } });
    const a = await h.license();
    expect((await put(h, a, envelopeBytes('PTP1', 1000, 1))).status).toBe(201);
    const b = await move(h, a);

    const body = envelopeBytes('PTP1', 2000, 6);
    const created = await h.authed('/api/backup/uploads', b, { method: 'POST', body: JSON.stringify({ size: body.length }) });
    expect(created.status).toBe(201);
    const { uploadId } = (await created.json()) as { uploadId: string };
    const part = await h.authed(`/api/backup/uploads/${uploadId}/parts/1`, b, {
      method: 'PUT',
      body,
      headers: { 'Content-Length': String(body.length) },
    });
    expect(part.status).toBe(200);
    const { etag } = (await part.json()) as { etag: string };
    const done = await h.authed(`/api/backup/uploads/${uploadId}/complete`, b, {
      method: 'POST',
      body: JSON.stringify({ parts: [{ partNumber: 1, etag }] }),
    });
    expect(done.status).toBe(201);
    expect(await download(h, b)).toEqual(body);

    const before = await storedBytes();
    expect((await h.authed('/api/backup', b, { method: 'DELETE' })).status).toBe(200);
    expect(await storedBytes()).toBe(before - 3000);
    expect((await h.authed('/api/backup', b, { method: 'HEAD' })).status).toBe(404);
  });

  it('never shows one trainer the backup of another, before or after moves', async () => {
    const h = await harness();
    const mine = await h.license('كابتن أول');
    const theirs = await h.license('كابتن تاني');
    expect((await put(h, mine, envelopeBytes('PTP1', 1024, 1))).status).toBe(201);
    const moved = await move(h, mine);

    expect((await h.authed('/api/backup', theirs)).status).toBe(404);
    expect((await h.authed('/api/backup', theirs, { method: 'HEAD' })).status).toBe(404);
    const theirsMoved = await move(h, theirs);
    expect((await h.authed('/api/backup', theirsMoved)).status).toBe(404);
    // Their own upload lands in their account and does not touch mine.
    expect((await put(h, theirsMoved, envelopeBytes('PTP1', 2048, 9))).status).toBe(201);
    expect(await download(h, moved)).toEqual(envelopeBytes('PTP1', 1024, 1));
    expect((await h.authed('/api/backup', moved, { method: 'HEAD' })).headers.get('X-Backup-Previous-Size')).toBeNull();
  });
});

describe('move to new device: client pages and push', () => {
  it('keeps client pages and pending check-ins with the trainer; the old license loses access', async () => {
    const h = await harness();
    const a = await h.license();
    const shareId = newShareId();
    const writeToken = crypto.getRandomValues(new Uint8Array(32));
    expect((await publishShare(h, a, shareId, writeToken)).status).toBe(200);
    expect((await postCheckin(h, shareId, writeToken)).status).toBe(201);

    const b = await move(h, a);
    // The client's link keeps working, and check-ins keep arriving after the move.
    expect((await h.send(`/api/share/${shareId}`)).status).toBe(200);
    expect((await postCheckin(h, shareId, writeToken)).status).toBe(201);

    const list = (await readJson(await h.authed('/api/checkins', b))) as { checkins: Array<{ id: string; shareId: string }> };
    expect(list.checkins).toHaveLength(2);
    expect(list.checkins.every((c) => c.shareId === shareId)).toBe(true);
    const first = list.checkins[0]?.id ?? '';
    expect((await h.authed(`/api/share/${shareId}/checkins`, b)).status).toBe(200);
    expect((await h.authed(`/api/share/${shareId}/checkins/${first}`, b)).status).toBe(200);
    expect((await h.authed(`/api/share/${shareId}/checkins/${first}`, b, { method: 'DELETE' })).status).toBe(200);
    expect((await publishShare(h, b, shareId, writeToken)).status).toBe(200);

    expect((await h.authed(`/api/share/${shareId}/checkins`, a)).status).toBe(403);
    expect((await publishShare(h, a, shareId, writeToken)).status).toBe(403);
    expect((await h.authed(`/api/share/${shareId}`, a, { method: 'DELETE' })).status).toBe(403);

    const other = await h.license();
    expect((await h.authed(`/api/share/${shareId}/checkins`, other)).status).toBe(403);

    expect((await h.authed(`/api/share/${shareId}`, b, { method: 'DELETE' })).status).toBe(200);
    expect((await h.send(`/api/share/${shareId}`)).status).toBe(404);
  });

  it('drops the old device push subscription and schedule when the license is moved', async () => {
    const h = await harness();
    const a = await h.license();
    expect((await h.authed('/api/push/subscribe', a, { method: 'POST', body: pushSubscription('https://web.push.apple.com/old-phone') })).status).toBe(200);
    const items = [{ id: 'x1', at: h.clock.now + 600, title: 'تذكير', body: 'عندك حصة' }];
    expect((await h.authed('/api/push/schedule', a, { method: 'PUT', body: JSON.stringify({ items }) })).status).toBe(200);

    const b = await move(h, a);
    const lid = lidOf(a);
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE lid = ?').bind(lid).first<{ n: number }>();
    const due = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_items WHERE device_key LIKE ?').bind(`${lid}:%`).first<{ n: number }>();
    expect([subs?.n, due?.n]).toEqual([0, 0]);
    expect((await h.authed('/api/push/subscribe', b, { method: 'POST', body: pushSubscription('https://web.push.apple.com/new-phone') })).status).toBe(200);
  });

  it('drops push rows on revoke too', async () => {
    const h = await harness();
    const a = await h.license();
    await h.authed('/api/push/subscribe', a, { method: 'POST', body: pushSubscription('https://web.push.apple.com/gone') });
    await h.revoke(a);
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE lid = ?').bind(lidOf(a)).first<{ n: number }>();
    expect(subs?.n).toBe(0);
  });
});

describe('migration 0003 backfill (licenses moved before lineage existed)', () => {
  /** The data statements of 0003, re-run against hand-made legacy rows (the ALTERs already ran at setup). */
  async function rerunBackfill(): Promise<void> {
    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0003'));
    if (migration === undefined) throw new Error('migration 0003 missing');
    const statement = (q: string) => q.replace(/^(\s*--[^\n]*\n)*/, '').trim();
    const data = migration.queries.map(statement).filter((q) => !/^(ALTER|CREATE)\b/i.test(q));
    expect(data.length).toBeGreaterThan(0);
    for (const q of data) await env.DB.prepare(q).run();
  }

  it('links an old chain to its root and re-points its backup and client page without moving R2 objects', async () => {
    const id = () => `legacy-${crypto.randomUUID()}`;
    const [a, b, c] = [id(), id(), id()];
    const row = (lid: string, status: string, replacedBy: string | null) =>
      env.DB.prepare(
        `INSERT INTO licenses (lid, code_hash, customer_name, duration_days, act_by, status, device_fp, created_at,
           activated_at, expires_at, revoked_at, replaced_by, feat, previous_lid, root_lid)
         VALUES (?, ?, 'x', NULL, 0, ?, NULL, 0, NULL, NULL, NULL, ?, '["core"]', NULL, NULL)`,
      ).bind(lid, `hash-${lid}`, status, replacedBy);
    const shareId = newShareId();
    await env.DB.batch([
      row(a, 'replaced', b),
      row(b, 'replaced', c),
      row(c, 'active', null),
      // b uploaded a backup and published a client page before moving to c.
      env.DB.prepare('INSERT INTO backups (lid, latest_slot, latest_size, latest_at, previous_size, previous_at) VALUES (?, 1, 10, 5, NULL, NULL)').bind(b),
      env.DB.prepare("INSERT INTO shares (share_id, lid, size, updated_at, revoked, checkin_hash) VALUES (?, ?, 10, 5, 0, 'h')").bind(shareId, b),
      env.DB.prepare("INSERT INTO checkins (id, share_id, lid, size, created_at) VALUES ('legacy-checkin', ?, ?, 3, 6)").bind(shareId, b),
    ]);
    await rerunBackfill();
    await rerunBackfill(); // idempotent

    const lineage = await env.DB.prepare('SELECT lid, previous_lid, root_lid FROM licenses WHERE lid IN (?, ?, ?) ORDER BY lid')
      .bind(a, b, c)
      .all();
    expect(new Map(lineage.results.map((r) => [r.lid, [r.previous_lid, r.root_lid]]))).toEqual(
      new Map([
        [a, [null, a]],
        [b, [a, a]],
        [c, [b, a]],
      ]),
    );
    expect(await env.DB.prepare('SELECT lid, key_lid FROM backups WHERE lid IN (?, ?)').bind(a, b).all().then((r) => r.results)).toEqual([
      { lid: a, key_lid: b },
    ]);
    expect(await env.DB.prepare('SELECT lid, key_lid FROM shares WHERE share_id = ?').bind(shareId).first()).toEqual({ lid: a, key_lid: b });
    expect(await env.DB.prepare("SELECT lid FROM checkins WHERE id = 'legacy-checkin'").first()).toEqual({ lid: a });
  });
});
