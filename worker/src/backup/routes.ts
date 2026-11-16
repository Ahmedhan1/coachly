// Cloud backup (feature 13). The body is an opaque PTP1 envelope (encrypted on the iPhone with the trainer's
// password); the Worker checks the 4-byte magic and the size, never the content.
import { authenticate } from '../cloud/auth';
import { checkedStream, declaredLength } from '../cloud/stream';
import { storageFull, wouldOverfill } from '../cloud/usage';
import { json, readLimitedText } from '../http';
import type { Deps } from '../ports';
import { RULES } from '../rateLimit';
import {
  abortPendingUpload,
  BACKUP_MAGIC,
  backupKey,
  deleteAllBackups,
  getBackup,
  getUpload,
  recordNewLatest,
  targetSlot,
  type BackupRow,
} from './store';

const OCTET = 'application/octet-stream';
const MAX_COMPLETE_BODY = 16_384;

function lengthError(check: { status: number; error: string }, maxBytes: number): Response {
  return json(check.status === 413 ? { error: check.error, maxBytes } : { error: check.error }, check.status);
}

async function putObject(deps: Deps, key: string, stream: ReadableStream<Uint8Array>, done: Promise<void>): Promise<boolean> {
  try {
    await Promise.all([
      deps.cloud.bucket.put(key, stream, { httpMetadata: { contentType: OCTET }, customMetadata: { at: String(deps.now()) } }),
      done,
    ]);
    return true;
  } catch {
    return false;
  }
}

/** PUT /api/backup — whole backup in one request (up to `singlePutMaxBytes`, 90 MiB by default). */
async function putBackup(request: Request, deps: Deps, lid: string): Promise<Response> {
  const { config } = deps.cloud;
  const check = declaredLength(request, config.backupMaxBytes);
  if (!check.ok) return lengthError(check, config.backupMaxBytes);
  if (check.length > config.singlePutMaxBytes) {
    return json({ error: 'use_multipart', maxBytes: config.singlePutMaxBytes }, 413);
  }
  const row = await getBackup(deps.cloud.db, lid);
  if (await wouldOverfill(deps.cloud, check.length, row?.latest_size ?? 0)) return storageFull();

  const body = request.body;
  if (body === null) return json({ error: 'length_required' }, 411);
  const checked = await checkedStream(body, check.length, BACKUP_MAGIC);
  if (!checked.ok) return json({ error: 'bad_format' }, 400);

  await abortPendingUpload(deps.cloud, lid);
  if (!(await putObject(deps, backupKey(lid, targetSlot(row)), checked.stream, checked.done))) {
    return json({ error: 'upload_failed' }, 400);
  }
  const now = deps.now();
  const { previousKept } = await recordNewLatest(deps.cloud, lid, row, check.length, now);
  return json({ size: check.length, uploadedAt: now, previousKept }, 201);
}

function slotFor(row: BackupRow, which: string | null): 0 | 1 | null {
  if (which === 'previous') return row.previous_size === null ? null : row.latest_slot === 0 ? 1 : 0;
  return which === null || which === 'latest' ? row.latest_slot : null;
}

/** GET /api/backup[?which=previous] — streams the envelope back. */
async function getBackupBody(request: Request, deps: Deps, lid: string): Promise<Response> {
  const which = new URL(request.url).searchParams.get('which');
  const row = await getBackup(deps.cloud.db, lid);
  const slot = row === null ? null : slotFor(row, which);
  if (row === null || slot === null) return json({ error: 'not_found' }, 404);
  const object = await deps.cloud.bucket.get(backupKey(lid, slot));
  if (object === null) return json({ error: 'not_found' }, 404);
  const at = slot === row.latest_slot ? row.latest_at : row.previous_at;
  return new Response(object.body, {
    headers: {
      'Content-Type': OCTET,
      'Content-Length': String(object.size),
      'Cache-Control': 'no-store',
      'X-Backup-Size': String(object.size),
      'X-Backup-Uploaded-At': String(at ?? ''),
    },
  });
}

/** HEAD /api/backup — size and time from D1 only (no R2 operation). */
async function headBackup(deps: Deps, lid: string): Promise<Response> {
  const row = await getBackup(deps.cloud.db, lid);
  if (row === null) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Backup-Size': String(row.latest_size),
    'X-Backup-Uploaded-At': String(row.latest_at),
  };
  if (row.previous_size !== null) {
    headers['X-Backup-Previous-Size'] = String(row.previous_size);
    headers['X-Backup-Previous-At'] = String(row.previous_at ?? '');
  }
  return new Response(null, { status: 200, headers });
}

/** POST /api/backup/uploads {size} — starts a multipart upload for backups bigger than one request allows. */
async function createUpload(request: Request, deps: Deps, lid: string): Promise<Response> {
  const { config } = deps.cloud;
  const text = await readLimitedText(request, 256);
  let size: unknown;
  try {
    size = text === null ? null : (JSON.parse(text) as { size?: unknown }).size;
  } catch {
    size = null;
  }
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) return json({ error: 'invalid' }, 400);
  if (size > config.backupMaxBytes) return json({ error: 'too_large', maxBytes: config.backupMaxBytes }, 413);
  const row = await getBackup(deps.cloud.db, lid);
  if (await wouldOverfill(deps.cloud, size, row?.latest_size ?? 0)) return storageFull();

  await abortPendingUpload(deps.cloud, lid);
  const slot = targetSlot(row);
  const upload = await deps.cloud.bucket.createMultipartUpload(backupKey(lid, slot), { httpMetadata: { contentType: OCTET } });
  const uploadId = deps.cloud.newId();
  const partSize = config.backupPartBytes;
  await deps.cloud.db
    .prepare(
      `INSERT INTO backup_uploads (upload_id, lid, r2_upload_id, slot, size, part_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(uploadId, lid, upload.uploadId, slot, size, partSize, deps.now())
    .run();
  return json({ uploadId, partSize, partCount: Math.ceil(size / partSize) }, 201);
}

/** PUT /api/backup/uploads/:id/parts/:n — one part, exactly `partSize` bytes (the last one: the remainder). */
async function uploadPart(request: Request, deps: Deps, lid: string, uploadId: string, partText: string): Promise<Response> {
  const up = await getUpload(deps.cloud.db, uploadId, lid);
  if (up === null) return json({ error: 'not_found' }, 404);
  const partCount = Math.ceil(up.size / up.part_size);
  const n = Number(partText);
  if (!Number.isInteger(n) || n < 1 || n > partCount) return json({ error: 'invalid' }, 400);
  const expected = n < partCount ? up.part_size : up.size - up.part_size * (partCount - 1);
  const check = declaredLength(request, expected);
  if (!check.ok) return lengthError(check, expected);
  if (check.length !== expected) return json({ error: 'wrong_part_size', expected }, 400);

  const body = request.body;
  if (body === null) return json({ error: 'length_required' }, 411);
  const checked = await checkedStream(body, expected, n === 1 ? BACKUP_MAGIC : '');
  if (!checked.ok) return json({ error: 'bad_format' }, 400);
  try {
    const multipart = deps.cloud.bucket.resumeMultipartUpload(backupKey(lid, up.slot), up.r2_upload_id);
    const [part] = await Promise.all([multipart.uploadPart(n, checked.stream), checked.done]);
    return json({ partNumber: part.partNumber, etag: part.etag });
  } catch {
    return json({ error: 'upload_failed' }, 400);
  }
}

function parseParts(text: string | null, partCount: number): R2UploadedPart[] | null {
  let value: unknown;
  try {
    value = text === null ? null : (JSON.parse(text) as { parts?: unknown }).parts;
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== partCount) return null;
  const parts: R2UploadedPart[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const { partNumber, etag } = item as Record<string, unknown>;
    if (typeof partNumber !== 'number' || typeof etag !== 'string' || etag.length === 0 || etag.length > 200) return null;
    parts.push({ partNumber, etag });
  }
  parts.sort((a, b) => a.partNumber - b.partNumber);
  return parts.every((p, i) => p.partNumber === i + 1) ? parts : null;
}

/** POST /api/backup/uploads/:id/complete {parts:[{partNumber, etag}]} — makes it the latest backup. */
async function completeUpload(request: Request, deps: Deps, lid: string, uploadId: string): Promise<Response> {
  const up = await getUpload(deps.cloud.db, uploadId, lid);
  if (up === null) return json({ error: 'not_found' }, 404);
  const parts = parseParts(await readLimitedText(request, MAX_COMPLETE_BODY), Math.ceil(up.size / up.part_size));
  if (parts === null) return json({ error: 'invalid' }, 400);
  let size: number;
  try {
    const object = await deps.cloud.bucket.resumeMultipartUpload(backupKey(lid, up.slot), up.r2_upload_id).complete(parts);
    size = object.size;
  } catch {
    return json({ error: 'upload_incomplete' }, 400);
  }
  await deps.cloud.db.prepare('DELETE FROM backup_uploads WHERE upload_id = ?').bind(uploadId).run();
  const row = await getBackup(deps.cloud.db, lid);
  const now = deps.now();
  const { previousKept } = await recordNewLatest(deps.cloud, lid, row, size, now);
  return json({ size, uploadedAt: now, previousKept }, 201);
}

/** Routes /api/backup*. Returns null for paths that are not backup paths. */
export async function routeBackup(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  const method = request.method;
  if (path === '/api/backup') {
    if (method === 'PUT') {
      const auth = await authenticate(request, deps, clientKey, RULES.backupWrite);
      return auth.ok ? putBackup(request, deps, auth.who.lid) : auth.response;
    }
    if (method === 'GET' || method === 'HEAD') {
      const auth = await authenticate(request, deps, clientKey, RULES.backupRead);
      if (!auth.ok) return auth.response;
      return method === 'GET' ? getBackupBody(request, deps, auth.who.lid) : headBackup(deps, auth.who.lid);
    }
    if (method === 'DELETE') {
      const auth = await authenticate(request, deps, clientKey, RULES.backupWrite);
      if (!auth.ok) return auth.response;
      return (await deleteAllBackups(deps.cloud, auth.who.lid)) ? json({ ok: true }) : json({ error: 'not_found' }, 404);
    }
    return json({ error: 'method_not_allowed' }, 405);
  }

  if (path === '/api/backup/uploads' && method === 'POST') {
    const auth = await authenticate(request, deps, clientKey, RULES.backupWrite);
    return auth.ok ? createUpload(request, deps, auth.who.lid) : auth.response;
  }
  const part = /^\/api\/backup\/uploads\/([A-Za-z0-9_-]{16,64})\/parts\/(\d{1,5})$/.exec(path);
  if (part !== null && method === 'PUT') {
    const auth = await authenticate(request, deps, clientKey, RULES.backupPart);
    return auth.ok ? uploadPart(request, deps, auth.who.lid, part[1] ?? '', part[2] ?? '') : auth.response;
  }
  const complete = /^\/api\/backup\/uploads\/([A-Za-z0-9_-]{16,64})\/complete$/.exec(path);
  if (complete !== null && method === 'POST') {
    const auth = await authenticate(request, deps, clientKey, RULES.backupPart);
    return auth.ok ? completeUpload(request, deps, auth.who.lid, complete[1] ?? '') : auth.response;
  }
  const abort = /^\/api\/backup\/uploads\/([A-Za-z0-9_-]{16,64})$/.exec(path);
  if (abort !== null && method === 'DELETE') {
    const auth = await authenticate(request, deps, clientKey, RULES.backupWrite);
    if (!auth.ok) return auth.response;
    const up = await getUpload(deps.cloud.db, abort[1] ?? '', auth.who.lid);
    if (up === null) return json({ error: 'not_found' }, 404);
    await abortPendingUpload(deps.cloud, auth.who.lid);
    return json({ ok: true });
  }
  return null;
}
