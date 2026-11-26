import Dexie, { type DexieOptions, type Table } from 'dexie';
import type {
  Client,
  Exercise,
  ImageMeta,
  MealPlan,
  Payment,
  PdfTemplate,
  Program,
  ProgressEntry,
  Recipe,
  Session,
  Supplement,
  TrainerSettings,
  WorkoutLog,
} from '@/domain/models';
import type { FileKind } from '../../shared/files';
import { MIGRATIONS, type EntityTableName, type Migration } from './schema';
import { StorageProblems, storageProblemMiddleware } from './storageProblems';

export const DB_NAME = 'pt-coach';

/** An image as the app uses it: metadata plus a Blob (built in memory from the stored bytes). */
export interface ImageRecord extends ImageMeta {
  blob: Blob;
}

/**
 * What the images table holds: metadata plus the raw bytes (`data`). Blobs inside IndexedDB are fragile on
 * WebKit (every iPhone browser): a picked photo is stored as a pointer to a temp file that iOS deletes later
 * ("WebKitBlobResource error 1"), and private/ephemeral sessions refuse Blobs outright. ArrayBuffers are stored
 * inline and always work. Rows written before 2026-11-27 still hold `blob` until `migrateBlobsToBytes` runs.
 */
export interface ImageRow extends ImageMeta {
  data?: ArrayBuffer;
  blob?: Blob;
}

/** Just the metadata of an image row or record (no bytes, no Blob). */
export function metaOf(row: ImageMeta): ImageMeta {
  return { id: row.id, mime: row.mime, width: row.width, height: row.height, bytes: row.bytes, createdAt: row.createdAt, demo: row.demo };
}

/** The row to store for `record`: bytes copied out of its Blob (async, so call it before a transaction). */
export async function toImageRow(record: ImageRecord): Promise<ImageRow> {
  return { ...metaOf(record), data: await record.blob.arrayBuffer() };
}

/** The in-memory record for a stored row (new rows: a Blob over the bytes; legacy rows: their Blob). */
export function fromImageRow(row: ImageRow | undefined): ImageRecord | undefined {
  if (!row) return undefined;
  if (row.data) return { ...metaOf(row), blob: new Blob([row.data], { type: row.mime }) };
  return row.blob ? { ...metaOf(row), blob: row.blob } : undefined;
}

/**
 * One cloud file on this device. `kind` + `ref` name it (e.g. client_photo + client id); the remote copy is
 * found by the same pair, so a restore or a lost answer never uploads it twice.
 */
export interface CloudFileRecord {
  id: string;
  kind: FileKind;
  ref: string | null;
  /** Content is a stored image (images table) ... */
  imageId: string | null;
  /** ... or bytes kept here until uploaded (PDF, invoice file). ArrayBuffer, not Blob: iOS Safari is unreliable with Blobs in IndexedDB. */
  bytes: ArrayBuffer | null;
  mime: string;
  name: string | null;
  remoteId: string | null;
  /** pending: upload due · synced: the server has this version · deleting: remove remotely, then forget. */
  state: 'pending' | 'synced' | 'deleting';
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface DeletionRecord {
  seq?: number;
  table: EntityTableName;
  entityId: string;
  at: number;
}

/** Applies every migration in order. Exported so the test harness can open older versions. */
export function applyMigrations(db: Dexie, migrations: readonly Migration[]): void {
  for (const m of migrations) {
    const version = db.version(m.version).stores(m.stores);
    if (m.upgrade) version.upgrade(m.upgrade);
  }
}

export class AppDatabase extends Dexie {
  settings!: Table<TrainerSettings, string>;
  meta!: Table<MetaRecord, string>;
  clients!: Table<Client, string>;
  payments!: Table<Payment, string>;
  sessions!: Table<Session, string>;
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  workoutLogs!: Table<WorkoutLog, string>;
  recipes!: Table<Recipe, string>;
  mealPlans!: Table<MealPlan, string>;
  supplements!: Table<Supplement, string>;
  progress!: Table<ProgressEntry, string>;
  pdfTemplates!: Table<PdfTemplate, string>;
  images!: Table<ImageRow, string>;
  deletions!: Table<DeletionRecord, number>;
  cloudFiles!: Table<CloudFileRecord, string>;
  /** Full disk, refused writes and other-tab upgrades; the app shell turns them into toasts. */
  readonly problems = new StorageProblems();

  constructor(name = DB_NAME, options?: DexieOptions, migrations: readonly Migration[] = MIGRATIONS) {
    super(name, options);
    applyMigrations(this, migrations);
    this.use(storageProblemMiddleware(this.problems));
    // Dexie's own handler (registered first) closes this connection so the other tab's upgrade can go ahead;
    // after that every query here would fail, so ask the trainer to reload instead of leaving a dead screen.
    this.on('versionchange', () => this.problems.emit('version_change'));
    this.on('blocked', () => this.problems.emit('blocked'));
  }
}
