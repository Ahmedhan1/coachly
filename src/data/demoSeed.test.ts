import { describe, expect, it } from 'vitest';
import { ensureFirstRun, hasDemoData, removeDemoData } from './demoSeed';
import { createTestData } from './testing';

const now = new Date(2026, 10, 16, 9, 0);

describe('demo seed', () => {
  it('seeds once on first run with Arabic demo clients, sessions today and payments', async () => {
    const { repos, db } = createTestData();
    expect(await ensureFirstRun(repos, db, now)).toBe(true);
    const clients = await repos.clients.list();
    expect(clients.length).toBe(5);
    expect(clients.every((c) => c.demo)).toBe(true);
    expect(clients.map((c) => c.name)).toContain('سارة محمود');
    const start = new Date(2026, 10, 16).getTime();
    expect((await repos.sessions.listBetween(start, start + 86_400_000)).length).toBe(4);
    expect((await repos.payments.list()).length).toBe(6);
    expect(await repos.settings.exists()).toBe(true);
    expect(await ensureFirstRun(repos, db, now)).toBe(false);
    expect((await repos.clients.list()).length).toBe(5);
  });

  it('removes all demo rows in one action and keeps the trainer’s own data', async () => {
    const { repos, db } = createTestData();
    await ensureFirstRun(repos, db, now);
    const mine = await repos.clients.create({
      name: 'عميل حقيقي', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [],
      measurements: {}, package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: null,
    });
    const demoClient = (await repos.clients.list()).find((c) => c.demo);
    if (demoClient) await repos.clients.softDelete(demoClient.id);
    expect(await hasDemoData(db)).toBe(true);
    const removed = await removeDemoData(db);
    expect(removed).toBeGreaterThan(10);
    expect(await hasDemoData(db)).toBe(false);
    expect((await repos.clients.list()).map((c) => c.id)).toEqual([mine.id]);
    expect(await db.deletions.count()).toBe(0);
    expect(await ensureFirstRun(repos, db, now)).toBe(false);
  });

  it('also removes rows the trainer added to a demo client, so nothing is left pointing at a removed client', async () => {
    const { repos, db } = createTestData();
    await ensureFirstRun(repos, db, now);
    const demoClient = (await repos.clients.list()).find((c) => c.demo);
    if (!demoClient) throw new Error('no demo client');
    await repos.payments.create({ clientId: demoClient.id, amountMinor: 100, currency: 'EGP', status: 'due', paidOn: null, dueOn: '2026-11-20', method: 'cash', note: '' });
    await repos.sessions.create({ clientId: demoClient.id, startsAt: now.getTime(), durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled', programId: null, notes: '' });
    await repos.progress.create({ clientId: demoClient.id, date: '2026-11-16', measurements: {}, photoIds: [], notes: '', source: 'trainer' });
    await removeDemoData(db);
    expect(await db.payments.where('clientId').equals(demoClient.id).count()).toBe(0);
    expect(await db.sessions.where('clientId').equals(demoClient.id).count()).toBe(0);
    expect(await db.progress.where('clientId').equals(demoClient.id).count()).toBe(0);
  });
});
