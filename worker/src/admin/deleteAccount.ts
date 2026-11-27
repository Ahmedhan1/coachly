import { abortPendingUpload, backupKey } from '../backup/store';
import { adjustUsage } from '../cloud/usage';
import { fileKey } from '../files/routes';
import type { CloudDeps } from '../ports';

/** What a complete delete removed. */
export interface DeleteReport {
  /** Objects removed from R2 / the file store. */
  objects: number;
  /** Bytes freed from the Worker's R2 storage counter. */
  bytes: number;
  /** Trainers released from the gym when the account was a gym. */
  releasedTrainers: number;
}

const BATCH = 1000;

/** Deletes every R2 object under `prefix` (R2 lists and deletes up to 1000 keys per call). */
async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, limit: BATCH, ...(cursor === undefined ? {} : { cursor }) });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) await bucket.delete(keys);
    removed += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return removed;
}

const sum = async (db: D1Database, sql: string, id: string): Promise<number> =>
  (await db.prepare(sql).bind(id).first<{ n: number | null }>())?.n ?? 0;

/**
 * Removes an account completely: its sign-in (user, sessions, linked logins), plan, gym (its trainers are released
 * and the gym's rosters dropped), gym membership and roster, push reminders, cloud backups, client pages,
 * check-ins and stored files. The R2 storage counter goes down by what was freed. Nothing of the account is left
 * on the server; the trainer's own phone keeps its local data.
 */
export async function deleteAccountData(cloud: CloudDeps, userId: string): Promise<DeleteReport> {
  const db = cloud.db;
  await abortPendingUpload(cloud, userId);

  // Bytes counted in storage_usage (everything in the Worker's R2; files only when they live there).
  const backupBytes = await sum(db, 'SELECT COALESCE(latest_size, 0) + COALESCE(previous_size, 0) AS n FROM backups WHERE lid = ?', userId);
  const shareBytes = await sum(db, 'SELECT SUM(size) AS n FROM shares WHERE lid = ?', userId);
  const checkinBytes = await sum(db, 'SELECT SUM(size) AS n FROM checkins WHERE lid = ?', userId);
  const fileBytes = cloud.files.sharesR2 ? await sum(db, 'SELECT SUM(size) AS n FROM cloud_files WHERE account = ?', userId) : 0;

  // Keys written under an older account id (backups / shares moved between devices keep their key).
  const legacy = await db
    .prepare('SELECT key_lid FROM backups WHERE lid = ?1 AND key_lid IS NOT NULL UNION SELECT key_lid FROM shares WHERE lid = ?1 AND key_lid IS NOT NULL')
    .bind(userId)
    .all<{ key_lid: string }>();
  const owners = new Set([userId, ...legacy.results.map((r) => r.key_lid)]);

  let objects = 0;
  for (const owner of owners) {
    const enc = encodeURIComponent(owner);
    await cloud.bucket.delete([backupKey(owner, 0), backupKey(owner, 1)]);
    objects += await deletePrefix(cloud.bucket, `shares/${enc}/`);
    objects += await deletePrefix(cloud.bucket, `checkins/${enc}/`);
  }
  if (cloud.files.sharesR2) {
    objects += await deletePrefix(cloud.bucket, `files/${encodeURIComponent(userId)}/`);
  } else if (cloud.files.store !== null) {
    const files = await db.prepare('SELECT id FROM cloud_files WHERE account = ?').bind(userId).all<{ id: string }>();
    for (const f of files.results) await cloud.files.store.delete(fileKey(userId, f.id));
    objects += files.results.length;
  }

  const released = await sum(db, "SELECT COUNT(*) AS n FROM gym_members WHERE gym_id = ? AND status <> 'removed'", userId);
  const freed = backupBytes + shareBytes + checkinBytes + fileBytes;
  await db.batch([
    db.prepare('DELETE FROM push_items WHERE device_key IN (SELECT device_key FROM push_subscriptions WHERE lid = ?)').bind(userId),
    db.prepare('DELETE FROM push_subscriptions WHERE lid = ?').bind(userId),
    db.prepare('DELETE FROM backup_uploads WHERE lid = ?').bind(userId),
    db.prepare('DELETE FROM backups WHERE lid = ?').bind(userId),
    db.prepare('DELETE FROM checkins WHERE lid = ?').bind(userId),
    db.prepare('DELETE FROM shares WHERE lid = ?').bind(userId),
    db.prepare('DELETE FROM cloud_files WHERE account = ?').bind(userId),
    db.prepare('DELETE FROM gym_rosters WHERE user_id = ?1 OR gym_id = ?1').bind(userId),
    db.prepare('DELETE FROM gym_members WHERE user_id = ?1 OR gym_id = ?1').bind(userId),
    db.prepare('DELETE FROM gyms WHERE id = ?').bind(userId),
    db.prepare('DELETE FROM account_plans WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(userId),
    db.prepare('DELETE FROM "account" WHERE "userId" = ?').bind(userId),
    db.prepare('DELETE FROM "user" WHERE "id" = ?').bind(userId),
    adjustUsage(db, -freed),
  ]);
  return { objects, bytes: freed, releasedTrainers: released };
}
