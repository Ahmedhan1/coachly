import { describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { migrateRows, replaceAllData, rowsLookValid, snapshotTables } from './backupIO';
import { MIGRATIONS } from './schema';
import { fakeIdbOptions } from './testing';

const meta = { createdAt: 1, updatedAt: 1, deletedAt: null, demo: false };

async function openDb(): Promise<AppDatabase> {
  const db = new AppDatabase('restore-test', fakeIdbOptions());
  await db.open();
  return db;
}

describe('replaceAllData', () => {
  it('replaces every table, keeps device-local meta, and works with change hooks subscribed', async () => {
    const db = await openDb();
    let deletingHooks = 0;
    let creatingHooks = 0;
    db.sessions.hook('deleting', () => void (deletingHooks += 1));
    db.sessions.hook('creating', () => void (creatingHooks += 1));
    await db.sessions.bulkAdd(Array.from({ length: 300 }, (_, i) => ({ id: `old${i}`, clientId: 'c', startsAt: i, ...meta }) as never));
    await db.meta.bulkAdd([
      { key: 'auth.token', value: 'mine' },
      { key: 'firstRunAt', value: 1 },
    ]);
    creatingHooks = 0;
    await replaceAllData(db, {
      sessions: [{ id: 'new1', clientId: 'c', startsAt: 5, ...meta }],
      meta: [{ key: 'firstRunAt', value: 2 }],
      clients: [{ id: 'c', name: 'سارة', ...meta }],
    });
    expect(await db.sessions.toCollection().primaryKeys()).toEqual(['new1']);
    expect(await db.clients.count()).toBe(1);
    expect((await db.meta.toArray()).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'auth.token', value: 'mine' },
      { key: 'firstRunAt', value: 2 },
    ]);
    // Clearing goes straight to IndexedDB (no per-row reads for the hook); new rows still notify listeners.
    expect(deletingHooks).toBe(0);
    expect(creatingHooks).toBe(1);
    db.close();
  });

  it('is all-or-nothing: a bad row aborts and the previous data stays', async () => {
    const db = await openDb();
    await db.clients.add({ id: 'keep', name: 'منى', ...meta } as never);
    await expect(
      replaceAllData(db, { clients: [{ id: 'a', name: 'x', ...meta }, { id: 'a', name: 'duplicate key', ...meta }] }),
    ).rejects.toBeTruthy();
    expect(await db.clients.toCollection().primaryKeys()).toEqual(['keep']);
    db.close();
  });
});

describe('restoring a backup written by an older app version', () => {
  it('v1 rows are migrated to the current schema and land intact', async () => {
    const v1Rows = {
      clients: [{ id: 'c1', name: 'سارة 💪', endDate: null, ...meta }],
      sessions: [
        { id: 's1', clientId: 'c1', startsAt: 2000, seriesId: null, ...meta },
        { id: 's2', clientId: 'c1', startsAt: 1000, seriesId: null, ...meta, deletedAt: 50 },
      ],
      meta: [{ key: 'demoSeededAt', value: 1 }],
    };
    const tempIdb = fakeIdbOptions();
    const upgraded = await migrateRows(v1Rows, 1, {
      openTemp: (name, migrations) => new AppDatabase(name, tempIdb, migrations),
    });
    const db = await openDb();
    expect(rowsLookValid(db, upgraded)).toBeNull();
    await replaceAllData(db, upgraded);
    expect(db.verno).toBe(MIGRATIONS.length);
    expect(await db.sessions.count()).toBe(2);
    expect(await db.sessions.where('deletedAt').above(0).primaryKeys()).toEqual(['s2']);
    expect((await db.clients.get('c1'))?.name).toBe('سارة 💪');
    const snap = await snapshotTables(db);
    expect(snap.tables.sessions).toHaveLength(2);
    db.close();
  });
});
