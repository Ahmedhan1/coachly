import type { Table } from 'dexie';
import { AppDatabase, type ImageRecord, type MetaRecord } from './db';
import { MIGRATIONS, TABLES, type Migration } from './schema';

/**
 * Whole-database read/write used by backup export and restore. Kept in the data layer so services never
 * reach into Dexie tables by hand.
 */

/** Meta keys that belong to this device/install and never travel inside a backup. */
export const DEVICE_LOCAL_META_PREFIXES: readonly string[] = ['license.', 'backup.'];

export function isDeviceLocalMetaKey(key: string): boolean {
  return DEVICE_LOCAL_META_PREFIXES.some((p) => key.startsWith(p));
}

/** Every table that is exported as rows (the images table is exported as metadata + separate files). */
export function rowTableNames(db: AppDatabase): string[] {
  return db.tables.map((t) => t.name).filter((n) => n !== TABLES.images).sort();
}

/** All rows of one table, soft-deleted rows included. Meta rows bound to this device are left out. */
export async function readTableRows(db: AppDatabase, name: string): Promise<unknown[]> {
  const rows = await db.table(name).toArray();
  if (name !== TABLES.meta) return rows;
  return (rows as MetaRecord[]).filter((r) => !isDeviceLocalMetaKey(r.key));
}

/**
 * Consistent snapshot of every row table plus the list of image ids, read in ONE read-only transaction so
 * an edit made during export cannot produce a half-old, half-new backup. Image Blobs are read afterwards
 * with `readImage` (images are only ever added or deleted, never changed in place).
 */
export async function snapshotTables(db: AppDatabase): Promise<{ tables: Record<string, unknown[]>; imageIds: string[] }> {
  return db.transaction('r', db.tables, async () => {
    const tables: Record<string, unknown[]> = {};
    for (const name of rowTableNames(db)) tables[name] = await readTableRows(db, name);
    return { tables, imageIds: await listImageIds(db) };
  });
}

export async function listImageIds(db: AppDatabase): Promise<string[]> {
  return (await db.images.toCollection().primaryKeys()).map(String).sort();
}

/** One image at a time, so exporting 500 photos never holds them all in memory. */
export async function readImage(db: AppDatabase, id: string): Promise<ImageRecord | undefined> {
  return db.images.get(id);
}

export interface ImageStats {
  count: number;
  bytes: number;
}

export async function imageStats(db: AppDatabase): Promise<ImageStats> {
  let count = 0;
  let bytes = 0;
  await db.images.each((img) => {
    count += 1;
    bytes += img.bytes;
  });
  return { count, bytes };
}

/** Rows ready to restore: table name → rows. `images` rows carry their Blob. */
export type RestoreTables = Record<string, unknown[]>;

function primaryKeyOf(table: Table): string | null {
  const pk = table.schema.primKey;
  return pk.keyPath && typeof pk.keyPath === 'string' ? pk.keyPath : null;
}

/** Light structural check: every row is an object whose primary key has a usable value. */
export function rowsLookValid(db: AppDatabase, tables: RestoreTables): string | null {
  const names = new Set(db.tables.map((t) => t.name));
  for (const [name, rows] of Object.entries(tables)) {
    if (!names.has(name)) return name;
    const table = db.table(name);
    const key = primaryKeyOf(table);
    const auto = table.schema.primKey.auto;
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return name;
      if (!key) continue;
      const v = (row as Record<string, unknown>)[key];
      const okKey = typeof v === 'string' ? v.length > 0 : typeof v === 'number' ? Number.isFinite(v) : auto && v === undefined;
      if (!okKey) return name;
    }
    if (name === TABLES.images) {
      for (const row of rows) if (!((row as { blob?: unknown }).blob instanceof Blob)) return name;
    }
  }
  return null;
}

/**
 * Replaces every table's contents in ONE read-write transaction: either all rows land or nothing changes
 * (IndexedDB aborts the transaction on any failure and the previous data stays). Device-local meta keys
 * of this install are kept. Tables missing from `tables` end up empty.
 */
export async function replaceAllData(db: AppDatabase, tables: RestoreTables): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = tables[table.name] ?? [];
      if (table.name === TABLES.meta) {
        const keys = (await db.meta.toCollection().primaryKeys()).map(String).filter((k) => !isDeviceLocalMetaKey(k));
        await db.meta.bulkDelete(keys);
        await db.meta.bulkAdd((rows as MetaRecord[]).filter((r) => !isDeviceLocalMetaKey(r.key)));
      } else {
        await table.clear();
        if (rows.length > 0) await table.bulkAdd(rows);
      }
    }
  });
}

export type TempDatabaseFactory = (name: string, migrations: readonly Migration[]) => AppDatabase;

export const defaultTempDatabaseFactory: TempDatabaseFactory = (name, migrations) => new AppDatabase(name, undefined, migrations);

/**
 * Runs rows written at an older schema version through the app's normal migration path: writes them into a
 * throwaway database opened at `fromVersion`, reopens it with every migration, reads the upgraded rows back
 * and deletes the throwaway database.
 */
export async function migrateRows(
  tables: RestoreTables,
  fromVersion: number,
  options: { migrations?: readonly Migration[]; openTemp?: TempDatabaseFactory; tempName?: string } = {},
): Promise<RestoreTables> {
  const migrations = options.migrations ?? MIGRATIONS;
  const openTemp = options.openTemp ?? defaultTempDatabaseFactory;
  const name = options.tempName ?? `pt-coach-restore-${crypto.randomUUID()}`;
  const old = openTemp(name, migrations.filter((m) => m.version <= fromVersion));
  try {
    await old.open();
    await old.transaction('rw', old.tables, async () => {
      for (const [table, rows] of Object.entries(tables)) {
        if (rows.length > 0) await old.table(table).bulkAdd(rows);
      }
    });
  } finally {
    old.close();
  }
  const upgraded = openTemp(name, migrations);
  try {
    await upgraded.open();
    const out: RestoreTables = {};
    for (const table of upgraded.tables) out[table.name] = await table.toArray();
    return out;
  } finally {
    upgraded.close();
    await upgraded.delete().catch(() => undefined);
  }
}
