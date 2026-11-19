// Client page (feature 12): encrypted page content per client, plus weekly check-ins from the client's browser.
// The key lives only in the link fragment (#k=...), so the Worker stores and serves ciphertext only.
import { base64UrlDecode, base64UrlEncode } from '../../../shared/license';
import { authenticate } from '../cloud/auth';
import { checkedStream, declaredLength } from '../cloud/stream';
import { adjustUsage, storageFull, wouldOverfill } from '../cloud/usage';
import { json } from '../http';
import type { Deps } from '../ports';
import { RULES } from '../rateLimit';
import { constantTimeEqual } from '../serverCrypto';
import { overPagesQuota } from './quota';
import { deleteShareFiles } from '../files/routes';

export const SHARE_ID = /^[A-Za-z0-9_-]{22,64}$/;
const HASH_B64 = /^[A-Za-z0-9_-]{43}$/;
const KEY_MAGIC = 'PTK1';
const OCTET = 'application/octet-stream';

interface ShareRow {
  share_id: string;
  /** Account id (root license id), so the page follows the trainer to a new device. */
  lid: string;
  /** Lid in this page's R2 keys (page and check-ins) when it differs from `lid` (pages from before migration 0003). */
  key_lid: string | null;
  size: number;
  updated_at: number;
  revoked: number;
  checkin_hash: string;
}

interface CheckinRow {
  id: string;
  share_id: string;
  lid: string;
  size: number;
  created_at: number;
}

export function shareKey(lid: string, shareId: string): string {
  return `shares/${encodeURIComponent(lid)}/${shareId}`;
}

export function checkinKey(lid: string, shareId: string, id: string): string {
  return `checkins/${encodeURIComponent(lid)}/${shareId}/${id}`;
}

/** The lid that names this page's blobs in R2. */
function keyLidOf(row: ShareRow): string {
  return row.key_lid ?? row.lid;
}

function getShare(db: D1Database, shareId: string): Promise<ShareRow | null> {
  return db.prepare('SELECT * FROM shares WHERE share_id = ?').bind(shareId).first<ShareRow>();
}

async function sha256B64(bytes: Uint8Array): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

async function putStream(deps: Deps, key: string, stream: ReadableStream<Uint8Array>, done: Promise<void>): Promise<boolean> {
  try {
    await Promise.all([deps.cloud.bucket.put(key, stream, { httpMetadata: { contentType: OCTET } }), done]);
    return true;
  } catch {
    return false;
  }
}

/** Loads a share and checks it belongs to this license. */
async function ownedShare(deps: Deps, shareId: string, lid: string): Promise<{ ok: true; row: ShareRow } | { ok: false; response: Response }> {
  const row = await getShare(deps.cloud.db, shareId);
  if (row === null) return { ok: false, response: json({ error: 'not_found' }, 404) };
  if (row.lid !== lid) return { ok: false, response: json({ error: 'forbidden' }, 403) };
  return { ok: true, row };
}

/** PUT /api/share/:shareId — create or replace the page content. Header X-Checkin-Key = b64url(SHA-256(writeToken)). */
async function putShare(request: Request, deps: Deps, lid: string, shareId: string): Promise<Response> {
  const { cloud } = deps;
  const checkinHash = request.headers.get('X-Checkin-Key') ?? '';
  if (!HASH_B64.test(checkinHash)) return json({ error: 'invalid' }, 400);
  const check = declaredLength(request, cloud.config.shareMaxBytes);
  if (!check.ok) return json(check.status === 413 ? { error: check.error, maxBytes: cloud.config.shareMaxBytes } : { error: check.error }, check.status);

  const existing = await getShare(cloud.db, shareId);
  if (existing !== null && existing.lid !== lid) return json({ error: 'forbidden' }, 403);
  if (existing?.revoked === 1) return json({ error: 'revoked' }, 410);
  if (existing === null) {
    const count = await cloud.db.prepare('SELECT COUNT(*) AS n FROM shares WHERE lid = ? AND revoked = 0').bind(lid).first<{ n: number }>();
    if ((count?.n ?? 0) >= cloud.config.maxSharesPerLicense) return json({ error: 'too_many_shares' }, 409);
  }
  if (await wouldOverfill(cloud, check.length, existing?.size ?? 0)) return storageFull();
  if (await overPagesQuota(cloud.db, lid, check.length, existing?.size ?? 0, cloud.config.pagesLicenseMaxBytes)) return storageFull();

  const body = request.body;
  if (body === null) return json({ error: 'length_required' }, 411);
  const checked = await checkedStream(body, check.length, KEY_MAGIC);
  if (!checked.ok) return json({ error: 'bad_format' }, 400);
  const key = shareKey(existing === null ? lid : keyLidOf(existing), shareId);
  if (!(await putStream(deps, key, checked.stream, checked.done))) return json({ error: 'upload_failed' }, 400);

  const now = deps.now();
  await cloud.db.batch([
    cloud.db
      .prepare(
        `INSERT INTO shares (share_id, lid, size, updated_at, revoked, checkin_hash) VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT (share_id) DO UPDATE SET size = excluded.size, updated_at = excluded.updated_at,
           checkin_hash = excluded.checkin_hash`,
      )
      .bind(shareId, lid, check.length, now, checkinHash),
    adjustUsage(cloud.db, check.length - (existing?.size ?? 0)),
  ]);
  return json({ shareId, size: check.length, updatedAt: now });
}

/** DELETE /api/share/:shareId — revoke: the page answers 404 from now on and every blob is deleted. */
async function revokeShare(deps: Deps, lid: string, shareId: string): Promise<Response> {
  const owned = await ownedShare(deps, shareId, lid);
  if (!owned.ok) return owned.response;
  if (owned.row.revoked === 1) return json({ ok: true });
  const { db, bucket } = deps.cloud;
  const { results } = await db.prepare('SELECT * FROM checkins WHERE share_id = ?').bind(shareId).all<CheckinRow>();
  const keyLid = keyLidOf(owned.row);
  await bucket.delete([shareKey(keyLid, shareId), ...results.map((c) => checkinKey(keyLid, shareId, c.id))]);
  const freed = owned.row.size + results.reduce((n, c) => n + c.size, 0);
  await db.batch([
    db.prepare('UPDATE shares SET revoked = 1, size = 0, updated_at = ? WHERE share_id = ?').bind(deps.now(), shareId),
    db.prepare('DELETE FROM checkins WHERE share_id = ?').bind(shareId),
    adjustUsage(db, -freed),
  ]);
  // Files the client uploaded through this page (photo, uploads) go with it; best effort.
  await deleteShareFiles(deps, shareId).catch(() => undefined);
  return json({ ok: true });
}

function etagOf(row: ShareRow): string {
  return `"${row.updated_at}-${row.size}"`;
}

/** GET /api/share/:shareId (public) — the encrypted page content. */
async function readShare(request: Request, deps: Deps, clientKey: string, shareId: string): Promise<Response> {
  const now = deps.now();
  // Memory only: two D1 writes per page view would be the largest D1 write cost at 500 trainers (docs/LIMITS.md).
  // A read needs the unguessable 128-bit page id, R2 reads are cheap (10 M Class B / month), and 304s cost none.
  if (!(await deps.localLimiter.hit(RULES.shareReadIp, clientKey, now))) return json({ error: 'rate_limited' }, 429);
  if (!(await deps.localLimiter.hit(RULES.shareReadPage, shareId, now))) return json({ error: 'rate_limited' }, 429);
  const row = await getShare(deps.cloud.db, shareId);
  if (row === null || row.revoked === 1) return json({ error: 'not_found' }, 404);
  const headers = { 'Cache-Control': 'private, no-cache', ETag: etagOf(row), 'X-Content-Type-Options': 'nosniff' };
  if (request.headers.get('If-None-Match') === etagOf(row)) return new Response(null, { status: 304, headers });
  const object = await deps.cloud.bucket.get(shareKey(keyLidOf(row), shareId));
  if (object === null) return json({ error: 'not_found' }, 404);
  return new Response(object.body, { headers: { ...headers, 'Content-Type': OCTET, 'Content-Length': String(object.size) } });
}

/** POST /api/share/:shareId/checkins (public) — header X-Checkin-Token = b64url(writeToken), body = PTK1 envelope. */
async function postCheckin(request: Request, deps: Deps, clientKey: string, shareId: string): Promise<Response> {
  const now = deps.now();
  const { cloud } = deps;
  const allowed =
    (await deps.limiter.hit(RULES.checkinIpHour, clientKey, now)) &&
    (await deps.limiter.hit(RULES.checkinIpDay, clientKey, now)) &&
    (await deps.limiter.hit(RULES.checkinPage, shareId, now));
  if (!allowed) return json({ error: 'rate_limited' }, 429);

  const row = await getShare(cloud.db, shareId);
  if (row === null || row.revoked === 1) return json({ error: 'not_found' }, 404);
  const token = base64UrlDecode(request.headers.get('X-Checkin-Token') ?? '');
  const encoder = new TextEncoder();
  if (token === null || token.length !== 32 || !constantTimeEqual(encoder.encode(await sha256B64(token)), encoder.encode(row.checkin_hash))) {
    return json({ error: 'forbidden' }, 403);
  }
  const check = declaredLength(request, cloud.config.checkinMaxBytes);
  if (!check.ok) return json(check.status === 413 ? { error: check.error, maxBytes: cloud.config.checkinMaxBytes } : { error: check.error }, check.status);
  const pending = await cloud.db.prepare('SELECT COUNT(*) AS n FROM checkins WHERE share_id = ?').bind(shareId).first<{ n: number }>();
  if ((pending?.n ?? 0) >= cloud.config.maxPendingCheckins) return json({ error: 'too_many_pending' }, 429);
  if (await overPagesQuota(cloud.db, row.lid, check.length, 0, cloud.config.pagesLicenseMaxBytes)) {
    return json({ error: 'too_many_pending' }, 429);
  }
  if (await wouldOverfill(cloud, check.length, 0)) return storageFull();

  const body = request.body;
  if (body === null) return json({ error: 'length_required' }, 411);
  const checked = await checkedStream(body, check.length, KEY_MAGIC);
  if (!checked.ok) return json({ error: 'bad_format' }, 400);
  const id = cloud.newId();
  if (!(await putStream(deps, checkinKey(keyLidOf(row), shareId, id), checked.stream, checked.done))) return json({ error: 'upload_failed' }, 400);
  await cloud.db.batch([
    cloud.db
      .prepare('INSERT INTO checkins (id, share_id, lid, size, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, shareId, row.lid, check.length, now),
    adjustUsage(cloud.db, check.length),
  ]);
  return json({ id }, 201);
}

function listJson(rows: CheckinRow[]): Response {
  return json({ checkins: rows.map((c) => ({ id: c.id, shareId: c.share_id, createdAt: c.created_at, size: c.size })) });
}

async function getCheckin(deps: Deps, row: ShareRow, id: string): Promise<Response> {
  const c = await deps.cloud.db.prepare('SELECT * FROM checkins WHERE id = ? AND share_id = ?').bind(id, row.share_id).first<CheckinRow>();
  if (c === null) return json({ error: 'not_found' }, 404);
  const object = await deps.cloud.bucket.get(checkinKey(keyLidOf(row), row.share_id, id));
  if (object === null) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: { 'Content-Type': OCTET, 'Content-Length': String(object.size), 'Cache-Control': 'no-store', 'X-Created-At': String(c.created_at) },
  });
}

async function deleteCheckin(deps: Deps, row: ShareRow, id: string): Promise<Response> {
  const { db, bucket } = deps.cloud;
  const c = await db.prepare('SELECT * FROM checkins WHERE id = ? AND share_id = ?').bind(id, row.share_id).first<CheckinRow>();
  if (c === null) return json({ error: 'not_found' }, 404);
  await bucket.delete(checkinKey(keyLidOf(row), row.share_id, id));
  await db.batch([db.prepare('DELETE FROM checkins WHERE id = ?').bind(id), adjustUsage(db, -c.size)]);
  return json({ ok: true });
}

export async function routeShare(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  const method = request.method;
  if (path === '/api/checkins' && method === 'GET') {
    const auth = await authenticate(request, deps, clientKey, RULES.checkinOwner);
    if (!auth.ok) return auth.response;
    const { results } = await deps.cloud.db
      .prepare('SELECT * FROM checkins WHERE lid = ? ORDER BY created_at LIMIT 500')
      .bind(auth.who.account)
      .all<CheckinRow>();
    return listJson(results);
  }

  const m = /^\/api\/share\/([^/]+)(?:\/checkins(?:\/([A-Za-z0-9_-]{16,64}))?)?$/.exec(path);
  if (m === null) return null;
  const shareId = m[1] ?? '';
  if (!SHARE_ID.test(shareId)) return json({ error: 'not_found' }, 404);
  const isCheckins = path.includes('/checkins');
  const checkinId = m[2];

  if (!isCheckins) {
    if (method === 'GET') return readShare(request, deps, clientKey, shareId);
    if (method === 'PUT' || method === 'DELETE') {
      const auth = await authenticate(request, deps, clientKey, RULES.shareWrite);
      if (!auth.ok) return auth.response;
      return method === 'PUT' ? putShare(request, deps, auth.who.account, shareId) : revokeShare(deps, auth.who.account, shareId);
    }
    return json({ error: 'method_not_allowed' }, 405);
  }

  if (checkinId === undefined && method === 'POST') return postCheckin(request, deps, clientKey, shareId);
  if (method !== 'GET' && method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405);
  if (checkinId === undefined && method === 'DELETE') return json({ error: 'method_not_allowed' }, 405);

  const auth = await authenticate(request, deps, clientKey, RULES.checkinOwner);
  if (!auth.ok) return auth.response;
  const owned = await ownedShare(deps, shareId, auth.who.account);
  if (!owned.ok) return owned.response;
  if (checkinId === undefined) {
    const { results } = await deps.cloud.db
      .prepare('SELECT * FROM checkins WHERE share_id = ? ORDER BY created_at')
      .bind(shareId)
      .all<CheckinRow>();
    return listJson(results);
  }
  return method === 'GET' ? getCheckin(deps, owned.row, checkinId) : deleteCheckin(deps, owned.row, checkinId);
}
