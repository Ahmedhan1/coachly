import Dexie, { type Table } from 'dexie';
import { AppDatabase, type ImageRecord, type MetaRecord } from './db';
import { MIGRATIONS, TABLES, type Migration } from './schema';
import { categoryForSource, collectImageRefs, ORPHAN_GRACE_MS, type StorageCategory, type StoredImageInfo } from '@/domain/backup';

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
 * with `readImage`; each file's checksum is taken from the bytes actually written, so an image re-compressed
 * in place meanwhile still yields a consistent archive.
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
  await db.transaction('rw', db.tables, async (tx) => {
    for (const table of db.tables) {
      const rows = tables[table.name] ?? [];
      if (table.name === TABLES.meta) {
        const keys = (await db.meta.toCollection().primaryKeys()).map(String).filter((k) => !isDeviceLocalMetaKey(k));
        await db.meta.bulkDelete(keys);
        await db.meta.bulkAdd((rows as MetaRecord[]).filter((r) => !isDeviceLocalMetaKey(r.key)));
      } else {
        await clearStore(tx.idbtrans, table.name);
        if (rows.length > 0) await table.bulkAdd(rows);
      }
    }
  });
}

/**
 * Empties one object store with a native IndexedDB `clear()` inside the Dexie transaction. Dexie's own `clear()`
 * turns into "read every row, then delete it" as soon as any `deleting` hook is subscribed (the backup change
 * watcher subscribes one), which made restoring 30,000 sessions spend most of its time reading rows it was about
 * to throw away. A restore is always followed by a reload, so skipping per-row change events here is safe; the
 * `bulkAdd` that follows still reports the new rows.
 */
function clearStore(idbtrans: IDBTransaction, name: string): Promise<void> {
  return new Dexie.Promise<void>((resolve, reject) => {
    const req = idbtrans.objectStore(name).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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

/* ---------- On-device storage report and safe cleanup (Settings → storage card) ---------- */

/** Every stored image's metadata (no Blob) and which part of the app references it. */
export async function readImageOwners(db: AppDatabase): Promise<{
  images: StoredImageInfo[];
  owners: Map<string, StorageCategory>;
  clientCount: number;
}> {
  const images: StoredImageInfo[] = [];
  await db.images.each((img) => {
    images.push({ id: img.id, mime: img.mime, bytes: img.bytes, width: img.width, height: img.height, createdAt: img.createdAt });
  });
  const owners = await scanImageOwners(db, new Set(images.map((i) => i.id)));
  const clientCount = await db.clients.filter((c) => !(c as { deletedAt?: unknown }).deletedAt).count();
  return { images, owners, clientCount };
}

/** Scans every row of every table (soft-deleted rows included, so an undo never loses its photo). */
async function scanImageOwners(db: AppDatabase, ids: ReadonlySet<string>): Promise<Map<string, StorageCategory>> {
  const owners = new Map<string, StorageCategory>();
  if (ids.size === 0) return owners;
  for (const table of db.tables) {
    if (table.name === TABLES.images || table.name === TABLES.deletions) continue;
    await table.each((row: unknown) => {
      const found = new Set<string>();
      collectImageRefs(row, ids, found);
      if (found.size === 0) return;
      const key = table.name === TABLES.meta ? String((row as MetaRecord).key) : undefined;
      const category = categoryForSource(table.name, key);
      for (const id of found) {
        const prev = owners.get(id);
        if (prev === undefined || prev === 'other') owners.set(id, category);
      }
    });
  }
  return owners;
}

/**
 * Deletes the given images only if, re-checked inside one transaction over every table, nothing references
 * them and they are older than the grace period. Returns the bytes freed.
 */
export async function deleteUnreferencedImages(db: AppDatabase, ids: readonly string[], now: Date): Promise<{ deleted: number; bytes: number }> {
  return db.transaction('rw', db.tables, async () => {
    const candidates = new Set(ids);
    const owners = await scanImageOwners(db, candidates);
    let deleted = 0;
    let bytes = 0;
    for (const id of candidates) {
      if (owners.has(id)) continue;
      const img = await db.images.get(id);
      if (!img || now.getTime() - img.createdAt < ORPHAN_GRACE_MS) continue;
      await db.images.delete(id);
      deleted += 1;
      bytes += img.bytes;
    }
    return { deleted, bytes };
  });
}

/** Replaces one image's Blob in place (same id, so every reference keeps working). No-op if it is gone. */
export async function replaceImageBlob(db: AppDatabase, id: string, image: { blob: Blob; width: number; height: number }): Promise<boolean> {
  return db.transaction('rw', db.images, async () => {
    const current = await db.images.get(id);
    if (!current) return false;
    const mime = image.blob.type as ImageRecord['mime'];
    await db.images.put({ ...current, blob: image.blob, mime, width: image.width, height: image.height, bytes: image.blob.size });
    return true;
  });
}

/** Reads one image Blob (for re-compression). */
export async function readImageBlob(db: AppDatabase, id: string): Promise<Blob | undefined> {
  return (await db.images.get(id))?.blob;
}
