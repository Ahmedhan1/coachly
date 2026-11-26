import { describe, expect, it } from 'vitest';
import { DATA_OWNER_KEY, eraseLocalData, hasUserData } from './accountData';
import { AppDatabase } from './db';
import { fakeIdbOptions } from './testing';

const meta = { createdAt: 1, updatedAt: 1, deletedAt: null };

async function openDb(): Promise<AppDatabase> {
  const db = new AppDatabase(`account-data-${crypto.randomUUID()}`, fakeIdbOptions());
  await db.open();
  return db;
}

describe('hasUserData', () => {
  it('ignores the demo data and sees the trainer own rows', async () => {
    const db = await openDb();
    expect(await hasUserData(db)).toBe(false);
    await db.clients.add({ id: 'demo1', name: 'سارة', ...meta, demo: true } as never);
    expect(await hasUserData(db)).toBe(false);
    await db.clients.add({ id: 'c1', name: 'أحمد', ...meta, demo: false } as never);
    expect(await hasUserData(db)).toBe(true);
    db.close();
  });
});

describe('eraseLocalData', () => {
  it('empties every table and the previous account backup keys, but keeps this session', async () => {
    const db = await openDb();
    await db.clients.add({ id: 'c1', name: 'أحمد', ...meta, demo: false } as never);
    await db.meta.bulkAdd([
      { key: 'auth.token', value: 'tok-b' },
      { key: DATA_OWNER_KEY, value: 'account-a' },
      { key: 'backup.cloudPassword', value: 'password of account a' },
      { key: 'files.key', value: 'key of account a' },
      { key: 'identity.setupDoneAt', value: 1 },
    ]);
    await eraseLocalData(db);
    expect(await db.clients.count()).toBe(0);
    expect((await db.meta.toArray()).map((r) => r.key).sort()).toEqual([DATA_OWNER_KEY, 'auth.token']);
    db.close();
  });
});
