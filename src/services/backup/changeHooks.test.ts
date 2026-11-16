import { describe, expect, it } from 'vitest';
import { watchDataChanges } from './changeHooks';
import { seedDatabase, testDbFactory } from './testFixtures';

describe('watchDataChanges', () => {
  it('fires after data writes, not for meta-only writes, and can be removed', async () => {
    const db = testDbFactory().open();
    await db.open();
    let calls = 0;
    const stop = watchDataChanges(db, () => (calls += 1));
    await db.meta.put({ key: 'backup.status', value: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(0);
    await seedDatabase(db, { images: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    stop();
    await db.clients.clear();
    await db.settings.put({ ...(await db.settings.toArray())[0]!, name: 'x' });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(before);
  });
});
