import { describe, expect, it } from 'vitest';
import type { DBCore, DBCoreMutateRequest } from 'dexie';
import { AppDatabase } from './db';
import { createRepositories } from './repositories';
import { classifyStorageError, type StorageProblem } from './storageProblems';
import { fakeIdbOptions, manualClock, sequentialIds } from './testing';

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/** A database whose IndexedDB writes fail like a full disk once `full.on` is set. */
function fullDiskDb() {
  const db = new AppDatabase('quota', fakeIdbOptions());
  const full = { on: false };
  db.use({
    stack: 'dbcore',
    name: 'test-full-disk',
    level: 0,
    create: (down: DBCore) => ({
      ...down,
      table: (name: string) => {
        const t = down.table(name);
        return { ...t, mutate: (req: DBCoreMutateRequest) => (full.on && name !== 'meta' ? Promise.reject(quota()) : t.mutate(req)) };
      },
    }),
  });
  const problems: StorageProblem[] = [];
  db.problems.subscribe((p) => problems.push(p));
  return { db, full, problems, repos: createRepositories(db, manualClock(), sequentialIds()) };
}

const newClient = {
  name: 'سارة 💪', phone: '', gender: null, birthDate: null, goal: 'fitness' as const, goalNote: '', injuries: [], measurements: {},
  package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: null,
};

describe('storage problems', () => {
  it('classifies quota errors whether raw DOMException or wrapped by Dexie', () => {
    expect(classifyStorageError(quota())).toBe('quota');
    expect(classifyStorageError({ name: 'AbortError', inner: quota() })).toBe('quota');
    expect(classifyStorageError(new DOMException('x', 'UnknownError'))).toBe('write_failed');
    // Logic errors the screens already handle (duplicate keys, validation) are not storage problems.
    expect(classifyStorageError(new DOMException('x', 'ConstraintError'))).toBeNull();
    expect(classifyStorageError(new Error('zod'))).toBeNull();
  });

  it('a write that fails because storage is full is reported (not lost silently) and the caller still sees the error', async () => {
    const { db, full, problems, repos } = fullDiskDb();
    await repos.clients.create(newClient);
    full.on = true;
    await expect(repos.clients.create(newClient)).rejects.toBeTruthy();
    expect(problems).toContain('quota');
    full.on = false;
    expect(await db.clients.count()).toBe(1);
    db.close();
  });

  it('a newer version opened elsewhere asks this tab to reload instead of staying blocked', async () => {
    const options = fakeIdbOptions();
    const oldTab = new AppDatabase('two-tabs', options);
    await oldTab.open();
    const problems: StorageProblem[] = [];
    oldTab.problems.subscribe((p) => problems.push(p));
    // Another tab running a newer build opens the same database at a higher version.
    const newer = new AppDatabase('two-tabs', options, [
      ...((await import('./schema')).MIGRATIONS),
      { version: 99, stores: { clients: 'id, name, endDate, updatedAt, deletedAt, extra' } },
    ]);
    await newer.open(); // resolves: the old tab closed its connection instead of blocking the upgrade
    expect(newer.verno).toBe(99);
    expect(problems).toContain('version_change');
    expect(oldTab.isOpen()).toBe(false);
    newer.close();
  });
});
