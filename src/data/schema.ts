import type { Transaction } from 'dexie';

/**
 * Versioned IndexedDB schema.
 *
 * Rules for future versions (never edit a shipped entry):
 * 1. Append a new `Migration` with the next version number.
 * 2. `stores` lists only tables whose indexes change (null deletes a table).
 * 3. Put data rewrites in `upgrade`; it runs once, inside the version-change transaction.
 * 4. Add a case to `migrations.test.ts` that opens the previous version with fixture rows,
 *    reopens at the new version and asserts the rows were upgraded.
 */
export interface Migration {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const TABLES = {
  settings: 'settings',
  meta: 'meta',
  clients: 'clients',
  payments: 'payments',
  sessions: 'sessions',
  exercises: 'exercises',
  programs: 'programs',
  workoutLogs: 'workoutLogs',
  recipes: 'recipes',
  mealPlans: 'mealPlans',
  supplements: 'supplements',
  progress: 'progress',
  pdfTemplates: 'pdfTemplates',
  images: 'images',
  deletions: 'deletions',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Tables holding soft-deletable entities (have createdAt/updatedAt/deletedAt/demo). */
export const ENTITY_TABLES = [
  TABLES.clients,
  TABLES.payments,
  TABLES.sessions,
  TABLES.exercises,
  TABLES.programs,
  TABLES.workoutLogs,
  TABLES.recipes,
  TABLES.mealPlans,
  TABLES.supplements,
  TABLES.progress,
  TABLES.pdfTemplates,
] as const;
export type EntityTableName = (typeof ENTITY_TABLES)[number];

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    stores: {
      [TABLES.settings]: 'id',
      [TABLES.meta]: 'key',
      [TABLES.clients]: 'id, name, endDate, updatedAt',
      [TABLES.payments]: 'id, clientId, status, paidOn, dueOn',
      [TABLES.sessions]: 'id, clientId, startsAt, seriesId',
      [TABLES.exercises]: 'id, name, source, builtinRef',
      [TABLES.programs]: 'id, clientId, name',
      [TABLES.workoutLogs]: 'id, clientId, date, [clientId+date]',
      [TABLES.recipes]: 'id, name',
      [TABLES.mealPlans]: 'id, clientId',
      [TABLES.supplements]: 'id, name',
      [TABLES.progress]: 'id, clientId, date, [clientId+date]',
      [TABLES.pdfTemplates]: 'id, name',
      [TABLES.images]: 'id, createdAt',
      [TABLES.deletions]: '++seq, entityId, at',
    },
  },
  {
    // Scale (years of data): `deletedAt` indexes only soft-deleted rows (null is not an IndexedDB key), so purge
    // reads just those; `[clientId+startsAt]` gives a client's sessions in time order without a sort.
    // Index-only change: IndexedDB builds the new indexes from the existing rows, nothing to rewrite.
    version: 2,
    stores: {
      [TABLES.clients]: 'id, name, endDate, updatedAt, deletedAt',
      [TABLES.payments]: 'id, clientId, status, paidOn, dueOn, deletedAt',
      [TABLES.sessions]: 'id, clientId, startsAt, seriesId, deletedAt, [clientId+startsAt]',
      [TABLES.exercises]: 'id, name, source, builtinRef, deletedAt',
      [TABLES.programs]: 'id, clientId, name, deletedAt',
      [TABLES.workoutLogs]: 'id, clientId, date, [clientId+date], deletedAt',
      [TABLES.recipes]: 'id, name, deletedAt',
      [TABLES.mealPlans]: 'id, clientId, deletedAt',
      [TABLES.supplements]: 'id, name, deletedAt',
      [TABLES.progress]: 'id, clientId, date, [clientId+date], deletedAt',
      [TABLES.pdfTemplates]: 'id, name, deletedAt',
    },
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
