import type { AppDatabase } from './db';
import type { Clock } from './clock';
import { cascadeRestore } from './clientCascade';
import { TABLES, type EntityTableName } from './schema';

export interface UndoneDelete {
  table: EntityTableName;
  entityId: string;
}

/**
 * Restores the most recently soft-deleted entity in any table ("undo last delete").
 * Returns what was restored, or null when there is nothing to undo.
 */
export async function undoLastDelete(db: AppDatabase, clock: Clock): Promise<UndoneDelete | null> {
  const tables = [db.deletions, ...db.tables.filter((t) => t.name !== 'deletions')];
  return db.transaction('rw', tables, async () => {
    const last = await db.deletions.orderBy('seq').last();
    if (!last || last.seq === undefined) return null;
    const table = db.table<{ deletedAt: number | null; updatedAt: number }, string>(last.table);
    const row = await table.get(last.entityId);
    if (row && row.deletedAt !== null) {
      const now = clock();
      if (last.table === TABLES.clients) await cascadeRestore(db, last.entityId, row.deletedAt, now);
      await table.put({ ...row, deletedAt: null, updatedAt: now });
    }
    await db.deletions.delete(last.seq);
    return { table: last.table, entityId: last.entityId };
  });
}
