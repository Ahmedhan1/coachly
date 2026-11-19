// Cloud files API (photos, thumbnails, invoices, PDFs). Bodies are PTK1 envelopes encrypted on the device; the
// Worker checks the magic and the size, stores the bytes in the object store (iDrive e2) and indexes them in D1.
//
// Trainer (Authorization: Bearer <license token>):
//   GET    /api/files[?kind=&ref=&source=&since=]  list (newest change last, up to 500)
//   POST   /api/files?kind=<kind>[&ref=<ref>]        create        → 201 { file }
//   GET    /api/files/:id                            download (octet-stream)
//   PUT    /api/files/:id                            replace bytes → 200 { file }
//   DELETE /api/files/:id                            delete        → 200 { ok: true }
// Client page (X-Checkin-Token, the same write token as check-ins):
//   POST   /api/share/:shareId/files?kind=client_photo|client_upload → 201 { id }
//          A new client_photo replaces the client's previous one from that page.
import { base64UrlDecode, base64UrlEncode } from '../../../shared/license';
import {
  FILE_ID,
  FILE_MAGIC,
  FILE_REF,
  isClientUploadKind,
  isFileKind,
  type CloudFileInfo,
  type FileKind,
  type FileSource,
} from '../../../shared/files';
import { authenticate } from '../cloud/auth';
import { declaredLength, hasMagic } from '../cloud/stream';
import { json } from '../http';
import type { Deps, FilesDeps } from '../ports';
import { RULES } from '../rateLimit';
import { constantTimeEqual } from '../serverCrypto';

const OCTET = 'application/octet-stream';
const SHARE_ID = /^[A-Za-z0-9_-]{22,64}$/;
const LIST_LIMIT = 500;

export interface FileRow {
  id: string;
  account: string;
  kind: FileKind;
  ref: string | null;
  source: FileSource;
  share_id: string | null;
  size: number;
  created_at: number;
  updated_at: number;
}

export function fileKey(account: string, id: string): string {
  return `files/${encodeURIComponent(account)}/${id}`;
}

export function toInfo(row: FileRow): CloudFileInfo {
  return {
    id: row.id,
    kind: row.kind,
    ref: row.ref,
    source: row.source,
    shareId: row.share_id,
    size: row.size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function unavailable(): Response {
  return json({ error: 'files_unavailable' }, 503);
}

async function accountBytes(db: D1Database, account: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM cloud_files WHERE account = ?').bind(account).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Reads the declared-length body into memory (files are at most a few MB; the cap is checked first) and checks
 * the envelope magic. The object store signs a buffered body, so streaming would not save memory here.
 */
async function readBody(request: Request, maxBytes: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; response: Response }> {
  const check = declaredLength(request, maxBytes);
  if (!check.ok) {
    return { ok: false, response: json(check.status === 413 ? { error: check.error, maxBytes } : { error: check.error }, check.status) };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return { ok: false, response: json({ error: 'bad_format' }, 400) };
  }
  if (bytes.length !== check.length || !hasMagic(bytes, FILE_MAGIC) || bytes.length < 32) {
    return { ok: false, response: json({ error: 'bad_format' }, 400) };
  }
  return { ok: true, bytes };
}

async function store(files: FilesDeps, key: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await files.store!.put(key, bytes);
    return true;
  } catch {
    return false;
  }
}

async function getRow(db: D1Database, account: string, id: string): Promise<FileRow | null> {
  return db.prepare('SELECT * FROM cloud_files WHERE id = ? AND account = ?').bind(id, account).first<FileRow>();
}

async function listFiles(request: Request, deps: Deps, account: string): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const where = ['account = ?'];
  const args: Array<string | number> = [account];
  const kind = q.get('kind');
  if (kind !== null) {
    if (!isFileKind(kind)) return json({ error: 'invalid' }, 400);
    where.push('kind = ?');
    args.push(kind);
  }
  const ref = q.get('ref');
  if (ref !== null) {
    if (!FILE_REF.test(ref)) return json({ error: 'invalid' }, 400);
    where.push('ref = ?');
    args.push(ref);
  }
  const source = q.get('source');
  if (source !== null) {
    if (source !== 'trainer' && source !== 'client') return json({ error: 'invalid' }, 400);
    where.push('source = ?');
    args.push(source);
  }
  const since = q.get('since');
  if (since !== null) {
    if (!/^\d{1,12}$/.test(since)) return json({ error: 'invalid' }, 400);
    where.push('updated_at > ?');
    args.push(Number(since));
  }
  const { results } = await deps.cloud.db
    .prepare(`SELECT * FROM cloud_files WHERE ${where.join(' AND ')} ORDER BY updated_at, id LIMIT ${LIST_LIMIT}`)
    .bind(...args)
    .all<FileRow>();
  return json({ files: results.map(toInfo) });
}

async function createFile(request: Request, deps: Deps, account: string): Promise<Response> {
  const { files, db } = deps.cloud;
  const q = new URL(request.url).searchParams;
  const kind = q.get('kind');
  const ref = q.get('ref');
  if (!isFileKind(kind) || kind === 'client_upload') return json({ error: 'invalid' }, 400);
  if (ref !== null && !FILE_REF.test(ref)) return json({ error: 'invalid' }, 400);
  const body = await readBody(request, files.maxBytes);
  if (!body.ok) return body.response;
  if ((await accountBytes(db, account)) + body.bytes.length > files.accountMaxBytes) {
    return json({ error: 'quota_exceeded', maxBytes: files.accountMaxBytes }, 507);
  }
  const id = deps.cloud.newId();
  if (!(await store(files, fileKey(account, id), body.bytes))) return json({ error: 'upload_failed' }, 502);
  const now = deps.now();
  const row: FileRow = { id, account, kind, ref, source: 'trainer', share_id: null, size: body.bytes.length, created_at: now, updated_at: now };
  await db
    .prepare('INSERT INTO cloud_files (id, account, kind, ref, source, share_id, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.account, row.kind, row.ref, row.source, row.share_id, row.size, row.created_at, row.updated_at)
    .run();
  return json({ file: toInfo(row) }, 201);
}

async function readFile(deps: Deps, account: string, id: string): Promise<Response> {
  const row = await getRow(deps.cloud.db, account, id);
  if (row === null) return json({ error: 'not_found' }, 404);
  let object;
  try {
    object = await deps.cloud.files.store!.get(fileKey(account, id));
  } catch {
    return json({ error: 'download_failed' }, 502);
  }
  if (object === null) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': OCTET,
      'Content-Length': String(row.size),
      'Cache-Control': 'no-store',
      'X-File-Kind': row.kind,
      'X-Updated-At': String(row.updated_at),
    },
  });
}

async function replaceFile(request: Request, deps: Deps, account: string, id: string): Promise<Response> {
  const { files, db } = deps.cloud;
  const row = await getRow(db, account, id);
  if (row === null) return json({ error: 'not_found' }, 404);
  const body = await readBody(request, files.maxBytes);
  if (!body.ok) return body.response;
  if ((await accountBytes(db, account)) - row.size + body.bytes.length > files.accountMaxBytes) {
    return json({ error: 'quota_exceeded', maxBytes: files.accountMaxBytes }, 507);
  }
  if (!(await store(files, fileKey(account, id), body.bytes))) return json({ error: 'upload_failed' }, 502);
  const now = Math.max(deps.now(), row.updated_at + 1);
  await db.prepare('UPDATE cloud_files SET size = ?, updated_at = ? WHERE id = ?').bind(body.bytes.length, now, id).run();
  return json({ file: toInfo({ ...row, size: body.bytes.length, updated_at: now }) });
}

async function removeRow(deps: Deps, row: FileRow): Promise<boolean> {
  try {
    await deps.cloud.files.store!.delete(fileKey(row.account, row.id));
  } catch {
    return false;
  }
  await deps.cloud.db.prepare('DELETE FROM cloud_files WHERE id = ?').bind(row.id).run();
  return true;
}

async function deleteFile(deps: Deps, account: string, id: string): Promise<Response> {
  const row = await getRow(deps.cloud.db, account, id);
  if (row === null) return json({ error: 'not_found' }, 404);
  return (await removeRow(deps, row)) ? json({ ok: true }) : json({ error: 'delete_failed' }, 502);
}

interface ShareAuthRow {
  share_id: string;
  lid: string;
  revoked: number;
  checkin_hash: string;
}

async function sha256B64(bytes: Uint8Array): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

/** POST /api/share/:shareId/files — a client uploads their own photo (or a file) from the client page. */
export async function postClientFile(request: Request, deps: Deps, clientKey: string, shareId: string): Promise<Response> {
  const { files, db } = deps.cloud;
  if (files.store === null) return unavailable();
  if (!SHARE_ID.test(shareId)) return json({ error: 'not_found' }, 404);
  const now = deps.now();
  const allowed =
    (await deps.limiter.hit(RULES.clientFileIpHour, clientKey, now)) && (await deps.limiter.hit(RULES.clientFilePage, shareId, now));
  if (!allowed) return json({ error: 'rate_limited' }, 429);

  const kind = new URL(request.url).searchParams.get('kind');
  if (!isClientUploadKind(kind)) return json({ error: 'invalid' }, 400);
  const share = await db.prepare('SELECT share_id, lid, revoked, checkin_hash FROM shares WHERE share_id = ?').bind(shareId).first<ShareAuthRow>();
  if (share === null || share.revoked === 1) return json({ error: 'not_found' }, 404);
  const token = base64UrlDecode(request.headers.get('X-Checkin-Token') ?? '');
  const encoder = new TextEncoder();
  if (token === null || token.length !== 32 || !constantTimeEqual(encoder.encode(await sha256B64(token)), encoder.encode(share.checkin_hash))) {
    return json({ error: 'forbidden' }, 403);
  }

  const body = await readBody(request, files.clientMaxBytes);
  if (!body.ok) return body.response;
  const pending = await db.prepare('SELECT COUNT(*) AS n FROM cloud_files WHERE share_id = ? AND kind = ?').bind(shareId, kind).first<{ n: number }>();
  const previous =
    kind === 'client_photo'
      ? await db.prepare("SELECT * FROM cloud_files WHERE share_id = ? AND kind = 'client_photo'").bind(shareId).all<FileRow>()
      : { results: [] as FileRow[] };
  if (kind === 'client_upload' && (pending?.n ?? 0) >= files.clientPendingMax) return json({ error: 'too_many_pending' }, 429);
  const replaced = previous.results.reduce((sum, r) => sum + r.size, 0);
  if ((await accountBytes(db, share.lid)) - replaced + body.bytes.length > files.accountMaxBytes) {
    return json({ error: 'quota_exceeded' }, 507);
  }

  const id = deps.cloud.newId();
  if (!(await store(files, fileKey(share.lid, id), body.bytes))) return json({ error: 'upload_failed' }, 502);
  await db
    .prepare('INSERT INTO cloud_files (id, account, kind, ref, source, share_id, size, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)')
    .bind(id, share.lid, kind, 'client', shareId, body.bytes.length, now, now)
    .run();
  for (const old of previous.results) await removeRow(deps, old);
  return json({ id }, 201);
}

/** Deletes every file a client page brought in (called when the trainer deletes that page). */
export async function deleteShareFiles(deps: Deps, shareId: string): Promise<void> {
  if (deps.cloud.files.store === null) return;
  const { results } = await deps.cloud.db.prepare('SELECT * FROM cloud_files WHERE share_id = ?').bind(shareId).all<FileRow>();
  for (const row of results) await removeRow(deps, row);
}

export async function routeFiles(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  const m = /^\/api\/files(?:\/([^/]+))?$/.exec(path);
  if (m === null) return null;
  const id = m[1];
  const method = request.method;
  if (id !== undefined && !FILE_ID.test(id)) return json({ error: 'not_found' }, 404);
  const allowed = id === undefined ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(method)) return json({ error: 'method_not_allowed' }, 405);

  const write = method !== 'GET';
  const auth = await authenticate(request, deps, clientKey, write ? RULES.filesWrite : RULES.filesRead);
  if (!auth.ok) return auth.response;
  if (deps.cloud.files.store === null) return unavailable();
  const account = auth.who.account;

  if (id === undefined) return method === 'GET' ? listFiles(request, deps, account) : createFile(request, deps, account);
  if (method === 'GET') return readFile(deps, account, id);
  if (method === 'PUT') return replaceFile(request, deps, account, id);
  return deleteFile(deps, account, id);
}
