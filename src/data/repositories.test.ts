import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { NewEntity } from './repositories';
import type { Client } from '@/domain/models';
import { createTestData } from './testing';
import { undoLastDelete } from './undo';

const newClient = (name: string, extra: Partial<NewEntity<Client>> = {}): NewEntity<Client> => ({
  name, phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
  package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: null, ...extra,
});

describe('EntityRepository via clients', () => {
  it('creates with id, timestamps and live marker', async () => {
    const { repos, clock } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    expect(c).toMatchObject({ id: 'id1', createdAt: clock(), updatedAt: clock(), deletedAt: null, demo: false });
    expect(await repos.clients.get(c.id)).toEqual(c);
  });

  it('rejects invalid data before writing', async () => {
    const { repos, db } = createTestData();
    await expect(repos.clients.create(newClient('  '))).rejects.toBeInstanceOf(ZodError);
    expect(await db.clients.count()).toBe(0);
  });

  it('createMany writes all rows in one go, in order, with ids and timestamps', async () => {
    const { repos, clock } = createTestData();
    const rows = await repos.clients.createMany([newClient('سارة'), newClient('منى')]);
    expect(rows.map((r) => [r.id, r.name, r.createdAt, r.deletedAt])).toEqual([
      ['id1', 'سارة', clock(), null],
      ['id2', 'منى', clock(), null],
    ]);
    expect((await repos.clients.list()).map((r) => r.name).sort()).toEqual(['سارة', 'منى']);
  });

  it('createMany writes nothing when any row is invalid', async () => {
    const { repos, db } = createTestData();
    await expect(repos.clients.createMany([newClient('سارة'), newClient('  ')])).rejects.toBeInstanceOf(ZodError);
    expect(await db.clients.count()).toBe(0);
  });

  it('updates, bumping updatedAt and keeping createdAt', async () => {
    const { repos, clock } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    clock.advance(1000);
    const u = await repos.clients.update(c.id, { notes: 'جديد' });
    expect(u.notes).toBe('جديد');
    expect(u.createdAt).toBe(c.createdAt);
    expect(u.updatedAt).toBe(c.updatedAt + 1000);
  });

  it('rejects an invalid update and leaves the row unchanged', async () => {
    const { repos } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    await expect(repos.clients.update(c.id, { remainingSessions: -4 })).rejects.toBeInstanceOf(ZodError);
    expect((await repos.clients.get(c.id))?.remainingSessions).toBe(0);
  });

  it('lists live rows sorted by Arabic name and searches with folding', async () => {
    const { repos } = createTestData();
    await repos.clients.create(newClient('منى حسن'));
    await repos.clients.create(newClient('أحمد علي', { phone: '0111' }));
    expect((await repos.clients.list()).map((c) => c.name)).toEqual(['أحمد علي', 'منى حسن']);
    expect((await repos.clients.search('احمد')).map((c) => c.name)).toEqual(['أحمد علي']);
    expect((await repos.clients.search('0111')).length).toBe(1);
  });

  it('soft deletes, hides, and restores', async () => {
    const { repos, db } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    await repos.clients.softDelete(c.id);
    expect(await repos.clients.get(c.id)).toBeUndefined();
    expect(await repos.clients.list()).toEqual([]);
    expect((await db.clients.get(c.id))?.deletedAt).not.toBeNull();
    await repos.clients.restore(c.id);
    expect((await repos.clients.get(c.id))?.name).toBe('سارة');
    expect(await db.deletions.count()).toBe(0);
  });

  it('undoLastDelete restores the most recent deletion across tables, one at a time', async () => {
    const { repos, db, clock } = createTestData();
    const a = await repos.clients.create(newClient('أ'));
    const b = await repos.clients.create(newClient('ب'));
    const p = await repos.payments.create({
      clientId: a.id, amountMinor: 100, currency: 'EGP', status: 'paid', paidOn: '2026-11-01', dueOn: null,
      method: 'cash', note: '',
    });
    await repos.clients.softDelete(a.id);
    clock.advance(10);
    await repos.payments.softDelete(p.id);
    clock.advance(10);
    await repos.clients.softDelete(b.id);

    expect(await undoLastDelete(db, clock)).toEqual({ table: 'clients', entityId: b.id });
    expect(await undoLastDelete(db, clock)).toEqual({ table: 'payments', entityId: p.id });
    expect(await repos.payments.get(p.id)).toBeDefined();
    expect(await repos.clients.get(a.id)).toBeUndefined();
    expect(await undoLastDelete(db, clock)).toEqual({ table: 'clients', entityId: a.id });
    expect(await undoLastDelete(db, clock)).toBeNull();
  });

  it('purges rows deleted before a cutoff', async () => {
    const { repos, db, clock } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    await repos.clients.softDelete(c.id);
    clock.advance(5000);
    expect(await repos.clients.purgeDeleted(clock())).toBe(1);
    expect(await db.clients.count()).toBe(0);
    expect(await db.deletions.count()).toBe(0);
  });

  it('throws NotFound when deleting a missing id', async () => {
    const { repos } = createTestData();
    await expect(repos.clients.softDelete('nope')).rejects.toThrow('not found');
  });
});

describe('specific repositories', () => {
  it('sessions: listBetween is half-open and ordered', async () => {
    const { repos } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    const mk = (startsAt: number) =>
      repos.sessions.create({
        clientId: c.id, startsAt, durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled',
        programId: null, notes: '',
      });
    await mk(3000);
    await mk(1000);
    await mk(5000);
    expect((await repos.sessions.listBetween(1000, 5000)).map((s) => s.startsAt)).toEqual([1000, 3000]);
  });

  it('progress: last check-in per client', async () => {
    const { repos } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    for (const date of ['2026-10-01', '2026-11-01', '2026-10-15']) {
      await repos.progress.create({ clientId: c.id, date, measurements: {}, photoIds: [], notes: '', source: 'trainer' });
    }
    expect((await repos.progress.lastCheckInByClient()).get(c.id)).toBe('2026-11-01');
    expect((await repos.progress.listByClient(c.id)).map((p) => p.date)).toEqual(['2026-10-01', '2026-10-15', '2026-11-01']);
  });

  it('payments: listByClient newest first', async () => {
    const { repos } = createTestData();
    const c = await repos.clients.create(newClient('سارة'));
    const pay = (paidOn: string) =>
      repos.payments.create({ clientId: c.id, amountMinor: 1, currency: 'EGP', status: 'paid', paidOn, dueOn: null, method: 'cash', note: '' });
    await pay('2026-01-01');
    await pay('2026-03-01');
    expect((await repos.payments.listByClient(c.id)).map((p) => p.paidOn)).toEqual(['2026-03-01', '2026-01-01']);
  });

  it('settings: defaults until written, validated on update', async () => {
    const { repos } = createTestData();
    expect(await repos.settings.exists()).toBe(false);
    expect((await repos.settings.get()).currency).toBe('EGP');
    const s = await repos.settings.update({ name: 'كابتن محمد', primaryColor: '#123456' });
    expect(s.name).toBe('كابتن محمد');
    await expect(repos.settings.update({ primaryColor: 'blue' })).rejects.toBeInstanceOf(ZodError);
    expect((await repos.settings.get()).primaryColor).toBe('#123456');
  });

  it('images: stores Blobs in their own table', async () => {
    const { repos } = createTestData();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const meta = await repos.images.save({ blob, width: 1200, height: 800 });
    expect(meta.bytes).toBe(3);
    const back = await repos.images.getBlob(meta.id);
    expect(back?.size).toBe(3);
    expect(await repos.images.totalBytes()).toBe(3);
    await expect(repos.images.save({ blob: new Blob(['x'], { type: 'text/plain' }), width: 1, height: 1 })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
