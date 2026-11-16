import { AppDatabase } from './db';
import { systemClock, type Clock } from './clock';
import { createRepositories, type Repositories } from './repositories';
import { undoLastDelete, type UndoneDelete } from './undo';
import { ensureFirstRun, hasDemoData, removeDemoData } from './demoSeed';

/** The data layer as the app sees it: repositories plus whole-database actions. */
export interface DataLayer {
  repos: Repositories;
  undoLastDelete(): Promise<UndoneDelete | null>;
  hasDemoData(): Promise<boolean>;
  removeDemoData(): Promise<number>;
  ensureFirstRun(now: Date): Promise<boolean>;
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
    close: () => db.close(),
  };
}

export { AppDatabase } from './db';
export { normalizeForSearch, matchesQuery, searchItems } from './search';
export type { Repositories, NewEntity, EntityPatch, SettingsPatch } from './repositories';
export type { UndoneDelete } from './undo';
