import type { Table } from 'dexie';
import type { AppDatabase } from './db';
import { TABLES } from './schema';

/**
 * Rows that belong to one client and must disappear with it, otherwise a deleted client's sessions keep
 * blocking calendar slots, firing push reminders and showing in the schedule, and their unpaid charges keep
 * showing as overdue income. Paid payments stay: they are real income history.
 *
 * Cascaded rows get the client's exact `deletedAt`, which is how restore/undo find them again (rows the
 * trainer deleted on their own earlier keep their own timestamp and stay deleted).
 */
interface CascadeRow {
  id: string;
  clientId: string | null;
  deletedAt: number | null;
  updatedAt: number;
  status?: string;
}

/** Every table whose rows carry a `clientId` (indexed). */
export const CASCADE_TABLES = [TABLES.sessions, TABLES.payments, TABLES.programs, TABLES.mealPlans, TABLES.workoutLogs, TABLES.progress] as const;

const cascades = (table: string, row: CascadeRow): boolean => !(table === TABLES.payments && row.status === 'paid');

export function cascadeTables(db: AppDatabase): Table[] {
  return CASCADE_TABLES.map((name) => db.table(name));
}

/** Soft-deletes the client's live rows at `at`. Call inside a rw transaction that includes `cascadeTables`. */
export async function cascadeDelete(db: AppDatabase, clientId: string, at: number): Promise<void> {
  for (const name of CASCADE_TABLES) {
    const table = db.table<CascadeRow, string>(name);
    const rows = await table.where('clientId').equals(clientId).filter((r) => r.deletedAt === null && cascades(name, r)).toArray();
    if (rows.length > 0) await table.bulkPut(rows.map((r) => ({ ...r, deletedAt: at, updatedAt: at })));
  }
}

/** Brings back the rows `cascadeDelete(clientId, deletedAt)` hid. */
export async function cascadeRestore(db: AppDatabase, clientId: string, deletedAt: number, now: number): Promise<void> {
  for (const name of CASCADE_TABLES) {
    const table = db.table<CascadeRow, string>(name);
    const rows = await table.where('clientId').equals(clientId).filter((r) => r.deletedAt === deletedAt).toArray();
    if (rows.length > 0) await table.bulkPut(rows.map((r) => ({ ...r, deletedAt: null, updatedAt: now })));
  }
}
