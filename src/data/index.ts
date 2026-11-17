import { AppDatabase } from './db';
import { systemClock, type Clock } from './clock';
import { createRepositories, type Repositories } from './repositories';
import { undoLastDelete, type UndoneDelete } from './undo';
import { ensureFirstRun, hasDemoData, removeDemoData } from './demoSeed';
import { runDailyPurge, type PurgeReport } from './purge';
import { renewPackage, undoRenewal, type RenewPackageResult } from './renewal';
import type { IsoDate } from '@/domain/models';
import type { StorageProblemListener } from './storageProblems';

/** The data layer as the app sees it: repositories plus whole-database actions. */
export interface DataLayer {
  repos: Repositories;
  undoLastDelete(): Promise<UndoneDelete | null>;
  hasDemoData(): Promise<boolean>;
  removeDemoData(): Promise<number>;
  ensureFirstRun(now: Date): Promise<boolean>;
  /** "جدّد": package dates + pending charge in one transaction; null when there is no package to renew. */
  renewPackage(clientId: string, today: IsoDate): Promise<RenewPackageResult | null>;
  undoRenewal(clientId: string, result: RenewPackageResult): Promise<void>;
  /** Housekeeping at startup: purges expired deleted rows/orphan photos at most once a day. */
  runDailyPurge(now: Date): Promise<PurgeReport | null>;
  /** Storage full, refused writes, or a newer version opened in another tab. Returns an unsubscribe. */
  onStorageProblem(listener: StorageProblemListener): () => void;
  close(): void;
}

export function createDataLayer(db: AppDatabase = new AppDatabase(), clock: Clock = systemClock): DataLayer {
  const repos = createRepositories(db, clock);
  return {
    repos,
    undoLastDelete: () => undoLastDelete(db, clock),
    hasDemoData: () => hasDemoData(db),
    removeDemoData: () => removeDemoData(db),
    ensureFirstRun: (now) => ensureFirstRun(repos, db, now),
    renewPackage: (clientId, today) => renewPackage(db, repos, clientId, today),
    undoRenewal: (clientId, result) => undoRenewal(db, repos, clientId, result),
    runDailyPurge: (now) => runDailyPurge(db, now),
    onStorageProblem: (listener) => db.problems.subscribe(listener),
    close: () => db.close(),
  };
}

export { AppDatabase } from './db';
export { normalizeForSearch, matchesQuery, searchItems, prepareSearch, filterPrepared, type PreparedSearch } from './search';
export type { Repositories, NewEntity, EntityPatch, SettingsPatch } from './repositories';
export type { UndoneDelete } from './undo';
export type { PurgeReport } from './purge';
export type { StorageProblem, StorageProblemListener } from './storageProblems';
export type { RenewPackageResult } from './renewal';
