import { describe, expect, it } from 'vitest';
import type { Client } from '@/domain/models';
import { RETENTION_DAYS } from '@/domain/retention';
import type { NewEntity } from './repositories';
import { LAST_PURGE_KEY, purgeExpired, runDailyPurge } from './purge';
import { createTestData } from './testing';
import { undoLastDelete } from './undo';

const DAY = 86_400_000;
const newClient = (name: string, photoId: string | null = null): NewEntity<Client> => ({
  name, phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
  package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: photoId as Client['photoId'],
});
const blob = () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' });

describe('purgeExpired', () => {
  it('hard-deletes rows soft-deleted more than 180 days ago with their undo entries; keeps recent ones undoable', async () => {
    const { db, repos, clock } = createTestData();
    const old = await repos.clients.create(newClient('قديم'));
    const recent = await repos.clients.create(newClient('جديد'));
    const live = await repos.clients.create(newClient('حي'));
    await repos.clients.softDelete(old.id);
    clock.advance((RETENTION_DAYS - 10) * DAY);
    await repos.clients.softDelete(recent.id);
    clock.advance(11 * DAY);

    const report = await purgeExpired(db, new Date(clock()));
    expect(report.rows).toBe(1);
    expect(await db.clients.get(old.id)).toBeUndefined();
    expect(await db.clients.get(live.id)).toBeDefined();
    expect(await db.deletions.where('entityId').equals(old.id).count()).toBe(0);
    expect(await undoLastDelete(db, clock)).toEqual({ table: 'clients', entityId: recent.id });
  });

  it('removes old photos nothing refers to, keeps referenced, fresh and meta-referenced ones', async () => {
    const { db, repos, clock } = createTestData();
    const orphan = await repos.images.save({ blob: blob(), width: 1, height: 1 });
    const used = await repos.images.save({ blob: blob(), width: 1, height: 1 });
    const inMeta = await repos.images.save({ blob: blob(), width: 1, height: 1 });
    const ofDeleted = await repos.images.save({ blob: blob(), width: 1, height: 1 });
    await repos.clients.create(newClient('أ', used.id));
    await db.meta.put({ key: 'pdf.branding', value: { logo: { imageId: inMeta.id } } });
    const gone = await repos.clients.create(newClient('ب', ofDeleted.id));
    clock.advance(RETENTION_DAYS * DAY + 1);
    await repos.clients.softDelete(gone.id); // deleted recently: its photo must survive for undo
    const fresh = await repos.images.save({ blob: blob(), width: 1, height: 1 });

    const report = await purgeExpired(db, new Date(clock()));
    expect(report.images).toBe(1);
    expect(await db.images.get(orphan.id)).toBeUndefined();
    for (const id of [used.id, inMeta.id, ofDeleted.id, fresh.id]) expect(await db.images.get(id)).toBeDefined();
  });

  it('runDailyPurge runs at most once a day and remembers when it ran', async () => {
    const { db, clock } = createTestData();
    const now = new Date(clock());
    expect(await runDailyPurge(db, now)).not.toBeNull();
    expect((await db.meta.get(LAST_PURGE_KEY))?.value).toBe(now.getTime());
    expect(await runDailyPurge(db, new Date(now.getTime() + 3_600_000))).toBeNull();
    expect(await runDailyPurge(db, new Date(now.getTime() + DAY))).not.toBeNull();
  });
});
