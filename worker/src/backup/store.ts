import type { CloudDeps } from '../ports';
import { adjustUsage, storedBytes } from '../cloud/usage';

export interface BackupRow {
  lid: string;
  latest_slot: 0 | 1;
  latest_size: number;
  latest_at: number;
  previous_size: number | null;
  previous_at: number | null;
}

export interface UploadRow {
  upload_id: string;
  lid: string;
  r2_upload_id: string;
  slot: 0 | 1;
  size: number;
  part_size: number;
  created_at: number;
}

export const BACKUP_MAGIC = 'PTP1';

/** Two slots per license; D1 says which one is the latest. R2 has no rename/copy, so we flip a pointer instead. */
export function backupKey(lid: string, slot: 0 | 1): string {
  return `backups/${encodeURIComponent(lid)}/${slot}`;
}

export function getBackup(db: D1Database, lid: string): Promise<BackupRow | null> {
  return db.prepare('SELECT * FROM backups WHERE lid = ?').bind(lid).first<BackupRow>();
}

/** The slot a new upload writes into: the one holding the previous backup (or slot 0 for the first one). */
export function targetSlot(row: BackupRow | null): 0 | 1 {
  return row === null ? 0 : row.latest_slot === 0 ? 1 : 0;
}

export function getUpload(db: D1Database, uploadId: string, lid: string): Promise<UploadRow | null> {
  return db.prepare('SELECT * FROM backup_uploads WHERE upload_id = ? AND lid = ?').bind(uploadId, lid).first<UploadRow>();
}

/** Aborts this license's unfinished multipart upload, if any (one at a time per license). */
export async function abortPendingUpload(cloud: CloudDeps, lid: string): Promise<void> {
  const pending = await cloud.db.prepare('SELECT * FROM backup_uploads WHERE lid = ?').bind(lid).first<UploadRow>();
  if (pending === null) return;
  try {
    await cloud.bucket.resumeMultipartUpload(backupKey(lid, pending.slot), pending.r2_upload_id).abort();
  } catch {
    // Already completed/aborted or expired on R2's side: nothing left to free.
  }
  await cloud.db.prepare('DELETE FROM backup_uploads WHERE upload_id = ?').bind(pending.upload_id).run();
}

/**
 * Records a new latest backup that has just been written to `targetSlot(row)`.
 *
 * Previous-copy policy: the backup that was latest becomes `previous` only if
 *   newSize + oldLatestSize <= backupMaxBytes   (one trainer never holds more than the cap), and
 *   the total stays under storageGuardBytes     (no second copies once R2 is nearly full).
 * Otherwise the old latest object is deleted (deletes are free). The object that was `previous` was in the
 * slot we just overwrote, so it is gone either way.
 */
export async function recordNewLatest(
  cloud: CloudDeps,
  lid: string,
  row: BackupRow | null,
  newSize: number,
  now: number,
): Promise<{ previousKept: boolean }> {
  const slot = targetSlot(row);
  const overwritten = row?.previous_size ?? 0;
  let keep = false;
  if (row !== null) {
    const total = await storedBytes(cloud.db);
    keep =
      newSize + row.latest_size <= cloud.config.backupMaxBytes &&
      total + newSize - overwritten <= cloud.config.storageGuardBytes;
  }
  const dropped = row !== null && !keep ? row.latest_size : 0;
  await cloud.db.batch([
    cloud.db
      .prepare(
        `INSERT INTO backups (lid, latest_slot, latest_size, latest_at, previous_size, previous_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (lid) DO UPDATE SET latest_slot = excluded.latest_slot, latest_size = excluded.latest_size,
           latest_at = excluded.latest_at, previous_size = excluded.previous_size, previous_at = excluded.previous_at`,
      )
      .bind(lid, slot, newSize, now, keep ? row?.latest_size ?? null : null, keep ? row?.latest_at ?? null : null),
    adjustUsage(cloud.db, newSize - overwritten - dropped),
  ]);
  if (row !== null && !keep) await cloud.bucket.delete(backupKey(lid, row.latest_slot));
  return { previousKept: keep };
}

export async function deleteAllBackups(cloud: CloudDeps, lid: string): Promise<boolean> {
  await abortPendingUpload(cloud, lid);
  const row = await getBackup(cloud.db, lid);
  if (row === null) return false;
  await cloud.bucket.delete([backupKey(lid, 0), backupKey(lid, 1)]);
  await cloud.db.batch([
    cloud.db.prepare('DELETE FROM backups WHERE lid = ?').bind(lid),
    adjustUsage(cloud.db, -(row.latest_size + (row.previous_size ?? 0))),
  ]);
  return true;
}
