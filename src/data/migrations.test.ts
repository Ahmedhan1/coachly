import { describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { LATEST_VERSION, MIGRATIONS, type Migration } from './schema';
import { fakeIdbOptions, migrateFrom } from './testing';

describe('schema migrations', () => {
  it('versions are strictly increasing starting at 1', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
    expect(LATEST_VERSION).toBe(MIGRATIONS.length);
  });

  it('a fresh database opens at the latest version with every table', async () => {
    const db = new AppDatabase('v1', fakeIdbOptions());
    await db.open();
    expect(db.verno).toBe(LATEST_VERSION);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [
        'clients', 'cloudFiles', 'deletions', 'exercises', 'images', 'mealPlans', 'meta', 'payments', 'pdfTemplates', 'programs',
        'progress', 'recipes', 'sessions', 'settings', 'supplements', 'workoutLogs',
      ].sort(),
    );
    db.close();
  });

  it('v1 → latest keeps every row of every table and serves the new indexes', async () => {
    const meta = { createdAt: 1, updatedAt: 1, demo: false };
    const db = await migrateFrom(1, async (old) => {
      await old.table('clients').bulkAdd([
        { id: 'c1', name: 'سارة 💪', endDate: '2026-12-01', ...meta, deletedAt: null },
        { id: 'c2', name: 'منى', endDate: null, ...meta, deletedAt: 500 },
      ]);
      await old.table('sessions').bulkAdd([
        { id: 's1', clientId: 'c1', startsAt: 3000, seriesId: null, ...meta, deletedAt: null },
        { id: 's2', clientId: 'c1', startsAt: 1000, seriesId: null, ...meta, deletedAt: null },
        { id: 's3', clientId: 'c2', startsAt: 2000, seriesId: null, ...meta, deletedAt: 900 },
      ]);
      await old.table('payments').add({ id: 'p1', clientId: 'c1', status: 'due', paidOn: null, dueOn: '2026-11-01', ...meta, deletedAt: null });
      await old.table('progress').add({ id: 'g1', clientId: 'c1', date: '2026-01-01', photoIds: ['img1'], ...meta, deletedAt: null });
      await old.table('images').add({ id: 'img1', createdAt: 1, blob: new Blob(['x']) });
      await old.table('meta').add({ key: 'firstRunAt', value: 1 });
      await old.table('deletions').add({ table: 'clients', entityId: 'c2', at: 500 });
    });
    expect(db.verno).toBe(LATEST_VERSION);
    expect(await db.clients.count()).toBe(2);
    expect((await db.clients.get('c1'))?.name).toBe('سارة 💪');
    expect(await db.sessions.count()).toBe(3);
    expect(await db.payments.count()).toBe(1);
    expect(await db.progress.count()).toBe(1);
    expect(await db.images.count()).toBe(1);
    expect(await db.meta.get('firstRunAt')).toEqual({ key: 'firstRunAt', value: 1 });
    expect(await db.deletions.count()).toBe(1);
    // v2 indexes: soft-deleted rows only (null is not an IndexedDB key) and a client's sessions in time order.
    expect(await db.clients.where('deletedAt').above(0).primaryKeys()).toEqual(['c2']);
    expect(await db.sessions.where('deletedAt').above(0).primaryKeys()).toEqual(['s3']);
    expect(
      await db.sessions.where('[clientId+startsAt]').between(['c1', -Infinity], ['c1', Infinity]).primaryKeys(),
    ).toEqual(['s2', 's1']);
    db.close();
  });

  it('harness: upgrades fixture rows written at an older version (example future version)', async () => {
    // A throwaway next version proving the pattern: add an index and backfill a field.
    const next: Migration = {
      version: LATEST_VERSION + 1,
      stores: { clients: 'id, name, endDate, updatedAt, deletedAt, archived' },
      upgrade: async (tx) => {
        await tx
          .table('clients')
          .toCollection()
          .modify((c: { archived?: number }) => {
            c.archived = 0;
          });
      },
    };
    const db = await migrateFrom(
      1,
      async (old) => {
        await old.table('clients').add({ id: 'c1', name: 'سارة', updatedAt: 1 });
      },
      [...MIGRATIONS, next],
    );
    expect(db.verno).toBe(LATEST_VERSION + 1);
    expect(await db.table('clients').where('archived').equals(0).count()).toBe(1);
    db.close();
  });
});
