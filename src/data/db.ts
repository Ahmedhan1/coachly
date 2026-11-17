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
import { MIGRATIONS, type EntityTableName, type Migration } from './schema';
import { StorageProblems, storageProblemMiddleware } from './storageProblems';

export const DB_NAME = 'pt-coach';

export interface ImageRecord extends ImageMeta {
  blob: Blob;
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
  images!: Table<ImageRecord, string>;
  deletions!: Table<DeletionRecord, number>;
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
