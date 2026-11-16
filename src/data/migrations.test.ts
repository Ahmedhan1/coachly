import { describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { LATEST_VERSION, MIGRATIONS, type Migration } from './schema';
import { fakeIdbOptions, migrateFrom } from './testing';

describe('schema migrations', () => {
  it('versions are strictly increasing starting at 1', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
    expect(LATEST_VERSION).toBe(MIGRATIONS.length);
  });

  it('v1 opens with every table', async () => {
    const db = new AppDatabase('v1', fakeIdbOptions());
    await db.open();
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [
        'clients', 'deletions', 'exercises', 'images', 'mealPlans', 'meta', 'payments', 'pdfTemplates', 'programs',
        'progress', 'recipes', 'sessions', 'settings', 'supplements', 'workoutLogs',
      ].sort(),
    );
    db.close();
  });

  it('harness: upgrades fixture rows written at an older version (example future v2)', async () => {
    // A throwaway v2 proving the pattern: add an index and backfill a field.
    const v2: Migration = {
      version: 2,
      stores: { clients: 'id, name, endDate, updatedAt, archived' },
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
      [...MIGRATIONS, v2],
    );
    expect(db.verno).toBe(2);
    expect(await db.table('clients').where('archived').equals(0).count()).toBe(1);
    db.close();
  });
});
