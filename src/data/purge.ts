import { collectReferencedIds, isPurgeDue, purgeCutoffMs } from '@/domain/retention';
import type { AppDatabase } from './db';
import { ENTITY_TABLES, TABLES } from './schema';

export interface PurgeReport {
  /** Soft-deleted rows removed for good. */
  rows: number;
  /** Undo-log entries removed. */
  deletions: number;
  /** Photos removed because nothing refers to them any more. */
  images: number;
}

/** When the purge last ran on this device (epoch ms). Harmless if it travels inside a backup. */
export const LAST_PURGE_KEY = 'maintenance.lastPurgeAt';

/**
 * Removes, in ONE transaction, everything older than the retention window (domain/retention):
 * - rows soft-deleted before the cutoff, and every undo-log entry older than it (so undo only ever offers
 *   recent deletions, which stay intact);
 * - photos created before the cutoff that no remaining row or meta value refers to (soft-deleted rows
 *   still inside the window keep their photos, so undo brings them back whole).
 * Existing backup files are unaffected; restoring an older backup simply brings expired rows back until
 * the next purge.
 */
export async function purgeExpired(db: AppDatabase, now: Date): Promise<PurgeReport> {
  const cutoff = purgeCutoffMs(now);
  return db.transaction('rw', db.tables, async () => {
    let rows = 0;
    const purged = new Set<string>();
    for (const name of ENTITY_TABLES) {
      const table = db.table<{ id: string; deletedAt: number | null }, string>(name);
      // `deletedAt` index (v2) holds only soft-deleted rows, so live history is never read here.
      const ids = (await table.where('deletedAt').below(cutoff).primaryKeys()) as string[];
      if (ids.length > 0) await table.bulkDelete(ids);
      rows += ids.length;
      for (const id of ids) purged.add(String(id));
    }
    // Cloud copies of what is gone for good (a client's photo, a payment's receipt): drop the local link to the
    // picture so it can be purged below, and queue the remote delete (or forget it if it never went up).
    if (purged.size > 0) {
      const copies = await db.cloudFiles.filter((r) => r.ref !== null && purged.has(r.ref)).toArray();
      for (const r of copies) {
        if (r.remoteId === null) await db.cloudFiles.delete(r.id);
        else await db.cloudFiles.put({ ...r, state: 'deleting', imageId: null, bytes: null, attempts: 0, nextAttemptAt: now.getTime() });
      }
    }
    const deletions = await db.deletions.where('at').below(cutoff).delete();

    const candidates = new Set(((await db.images.where('createdAt').below(cutoff).primaryKeys()) as string[]).map(String));
    let images = 0;
    if (candidates.size > 0) {
      const referenced = new Set<string>();
      for (const table of db.tables) {
        if (table.name === TABLES.images) continue;
        for (const id of collectReferencedIds(await table.toArray(), candidates)) referenced.add(id);
      }
      const orphans = [...candidates].filter((id) => !referenced.has(id));
      if (orphans.length > 0) await db.images.bulkDelete(orphans);
      images = orphans.length;
    }
    return { rows, deletions, images };
  });
}

/** App-startup entry point: purges at most once a day. Returns null when it was not due. */
export async function runDailyPurge(db: AppDatabase, now: Date): Promise<PurgeReport | null> {
  const last = (await db.meta.get(LAST_PURGE_KEY))?.value;
  if (!isPurgeDue(typeof last === 'number' && Number.isFinite(last) ? last : null, now)) return null;
  const report = await purgeExpired(db, now);
  await db.meta.put({ key: LAST_PURGE_KEY, value: now.getTime() });
  return report;
}
