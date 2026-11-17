import {
  imageFilePath,
  isAllowedArchivePath,
  MANIFEST_PATH,
  mimeForImagePath,
  parseManifest,
  schemaAction,
  tableFilePath,
  verifyArchiveFiles,
  type BackupManifest,
  type SchemaAction,
} from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { AppDatabase } from '@/data/db';
import { migrateRows, replaceAllData, rowsLookValid, type RestoreTables, type TempDatabaseFactory } from '@/data/backupIO';
import type { Migration } from '@/data/schema';
import type { ImportError, ImportSummary, ProgressListener } from './types';
import { readZipEntries, sha256Hex } from './zipIO';

export interface ImportArchiveOptions {
  /** The migration list `db` was built with (tests add future versions). */
  migrations?: readonly Migration[];
  openTemp?: TempDatabaseFactory;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
  maxEntryBytes?: number;
  /** Check every file against the manifest (integrity) and stop: nothing is written. */
  verifyOnly?: boolean;
}

const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const decoder = new TextDecoder();

/** Integrity check of a backup zip (every file's SHA-256 against the manifest, rows parse). Writes nothing. */
export function verifyArchive(db: AppDatabase, zip: Blob, options: Omit<ImportArchiveOptions, 'verifyOnly'> = {}): Promise<Result<ImportSummary, ImportError>> {
  return importArchive(db, zip, { ...options, verifyOnly: true });
}

/**
 * Restores a backup zip: reads it entry by entry, checks every file against the manifest's SHA-256, refuses
 * newer schema versions, migrates older ones, then replaces all data in one transaction. If anything fails
 * the current data stays exactly as it was. Never throws.
 */
export async function importArchive(
  db: AppDatabase,
  zip: Blob,
  options: ImportArchiveOptions = {},
): Promise<Result<ImportSummary, ImportError>> {
  try {
    return await run(db, zip, options);
  } catch {
    return err('malformed');
  }
}

export interface VerifiedArchive {
  manifest: BackupManifest;
  schema: SchemaAction;
  /** Rows per table; `images` rows carry their Blob. */
  tables: RestoreTables;
}

/**
 * Reads a backup zip entry by entry, checks every file against the manifest's SHA-256 and the schema version
 * policy, and returns the rows (image rows with their Blob). Writes nothing.
 */
export async function readVerifiedArchive(
  db: AppDatabase,
  zip: Blob,
  options: Pick<ImportArchiveOptions, 'onProgress' | 'signal' | 'maxEntryBytes'> = {},
): Promise<Result<VerifiedArchive, ImportError>> {
  try {
    return await readVerified(db, zip, options);
  } catch {
    return err('malformed');
  }
}

async function readVerified(
  db: AppDatabase,
  zip: Blob,
  options: Pick<ImportArchiveOptions, 'onProgress' | 'signal' | 'maxEntryBytes'>,
): Promise<Result<VerifiedArchive, ImportError>> {
  const actual = new Map<string, { sha256: string; bytes: number }>();
  const parsedTables = new Map<string, unknown>();
  const imageBlobs = new Map<string, Blob>();
  // Mutated inside the entry callback; an object keeps TypeScript from narrowing the fields to their initial values.
  const found: { manifest: string | null; badJson: boolean } = { manifest: null, badJson: false };

  options.onProgress?.({ phase: 'read', done: 0, total: zip.size });
  let readBytes = 0;
  const read = await readZipEntries(
    zip,
    async (path, bytes) => {
      readBytes += bytes.length;
      options.onProgress?.({ phase: 'read', done: Math.min(readBytes, zip.size), total: zip.size });
      if (path === MANIFEST_PATH) {
        found.manifest = decoder.decode(bytes);
        return;
      }
      actual.set(path, { sha256: await sha256Hex(bytes), bytes: bytes.length });
      if (path.startsWith('data/')) {
        try {
          parsedTables.set(path, JSON.parse(decoder.decode(bytes)));
        } catch {
          found.badJson = true;
        }
      } else {
        imageBlobs.set(path, new Blob([bytes as BlobPart], { type: mimeForImagePath(path) ?? '' }));
      }
    },
    { maxEntryBytes: options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES, isAllowed: isAllowedArchivePath, signal: options.signal },
  );
  if (!read.ok) return err(read.error);
  if (found.manifest === null) return err('not_a_backup');

  options.onProgress?.({ phase: 'verify', done: 0, total: 1 });
  const parsed = parseManifest(found.manifest);
  if (!parsed.ok) return err(parsed.error);
  const manifest = parsed.value;
  await db.open();
  const action = schemaAction(manifest.schemaVersion, db.verno);
  if (!action.ok) return err(action.error === 'newer_schema' ? 'newer_schema' : 'malformed');
  const check = verifyArchiveFiles(manifest, actual);
  if (!check.ok) return err(check.error);
  if (found.badJson) return err('malformed');

  const tables: RestoreTables = {};
  for (const [table, count] of Object.entries(manifest.counts)) {
    const rows = parsedTables.get(tableFilePath(table));
    if (!Array.isArray(rows) || rows.length !== count) return err('malformed');
    tables[table] = rows;
  }
  parsedTables.clear();
  const imageRows = tables.images ?? [];
  const withBlobs: unknown[] = [];
  for (const row of imageRows) {
    const { id, mime } = (row ?? {}) as { id?: unknown; mime?: unknown };
    const path = typeof id === 'string' && typeof mime === 'string' ? imageFilePath(id, mime) : null;
    const blob = path ? imageBlobs.get(path) : undefined;
    if (!blob) return err('missing_file');
    withBlobs.push({ ...(row as object), blob });
  }
  imageBlobs.clear();
  tables.images = withBlobs;
  options.onProgress?.({ phase: 'verify', done: 1, total: 1 });
  return ok({ manifest, schema: action.value, tables });
}

async function run(db: AppDatabase, zip: Blob, options: ImportArchiveOptions): Promise<Result<ImportSummary, ImportError>> {
  const verified = await readVerified(db, zip, options);
  if (!verified.ok) return verified;
  const { manifest } = verified.value;
  let tables = verified.value.tables;
  if (manifest.kind === 'photos' && !options.verifyOnly) return err('photo_archive');
  if (options.verifyOnly) {
    return ok({
      kind: manifest.kind,
      archiveId: manifest.archiveId ?? null,
      counts: { ...manifest.counts },
      schemaVersion: manifest.schemaVersion,
      migratedFrom: null,
      imageVariant: manifest.imageVariant,
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
    });
  }

  let migratedFrom: number | null = null;
  if (verified.value.schema === 'migrate') {
    options.onProgress?.({ phase: 'migrate', done: 0, total: 1 });
    try {
      tables = await migrateRows(tables, manifest.schemaVersion, { migrations: options.migrations, openTemp: options.openTemp });
    } catch {
      return err('migration_failed');
    }
    migratedFrom = manifest.schemaVersion;
    options.onProgress?.({ phase: 'migrate', done: 1, total: 1 });
  }
  if (rowsLookValid(db, tables) !== null) return err('malformed');
  if (options.signal?.aborted) return err('cancelled');

  options.onProgress?.({ phase: 'write', done: 0, total: 1 });
  try {
    await replaceAllData(db, tables);
  } catch {
    return err('write_failed');
  }
  options.onProgress?.({ phase: 'write', done: 1, total: 1 });

  const counts: Record<string, number> = {};
  for (const [table, rows] of Object.entries(tables)) counts[table] = rows.length;
  return ok({
    kind: manifest.kind,
    archiveId: manifest.archiveId ?? null,
    counts,
    schemaVersion: db.verno,
    migratedFrom,
    imageVariant: manifest.imageVariant,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
  });
}
