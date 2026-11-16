import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type Dexie from 'dexie';
import { AppDatabase } from './db';
import { createRepositories } from './repositories';
import { MIGRATIONS, type Migration } from './schema';

/** Test-only: a fresh in-memory IndexedDB factory per call, so tests never share state. */
export function fakeIdbOptions() {
  return { indexedDB: new IDBFactory(), IDBKeyRange };
}

/** Manual clock for tests. */
export function manualClock(start = 1_763_280_000_000) {
  let now = start;
  const clock = () => now;
  return Object.assign(clock, {
    advance(ms: number) {
      now += ms;
    },
  });
}

export function sequentialIds(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

export function createTestData(start?: number) {
  const db = new AppDatabase('test', fakeIdbOptions());
  const clock = manualClock(start);
  const repos = createRepositories(db, clock, sequentialIds());
  return { db, clock, repos };
}

/**
 * Migration harness: opens a database at the given version (using only migrations up to it),
 * lets the caller write fixture rows with raw Dexie, then reopens with the full migration list.
 */
export async function migrateFrom(
  fromVersion: number,
  writeFixtures: (db: Dexie) => Promise<void>,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<AppDatabase> {
  const options = fakeIdbOptions();
  const old = new AppDatabase('migration-test', options, migrations.filter((m) => m.version <= fromVersion));
  await old.open();
  await writeFixtures(old);
  old.close();
  const upgraded = new AppDatabase('migration-test', options, migrations);
  await upgraded.open();
  return upgraded;
}
