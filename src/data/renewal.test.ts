import { describe, expect, it } from 'vitest';
import type { Client } from '@/domain/models';
import { AppDatabase } from './db';
import { createRepositories, type NewEntity } from './repositories';
import { renewPackage, undoRenewal } from './renewal';
import { createTestData, fakeIdbOptions, manualClock } from './testing';

const client = (over: Partial<NewEntity<Client>> = {}): NewEntity<Client> => ({
  name: 'سارة', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
  package: { name: '', totalSessions: 12, priceMinor: 300_000, currency: 'EGP' },
  startDate: '2026-11-01', endDate: '2026-11-30', remainingSessions: 2, notes: '', photoId: null, ...over,
});

describe('renewPackage', () => {
  it('moves the dates and records the pending charge with the last payment method', async () => {
    const { db, repos } = createTestData();
    const c = await repos.clients.create(client());
    await repos.payments.create({ clientId: c.id, amountMinor: 1, currency: 'EGP', status: 'paid', paidOn: '2026-11-01', dueOn: null, method: 'instapay', note: '' });
    const r = await renewPackage(db, repos, c.id, '2026-11-16');
    if (!r) throw new Error('expected a renewal');
    expect(r.before).toEqual({ startDate: '2026-11-01', endDate: '2026-11-30', remainingSessions: 2 });
    expect(await repos.clients.get(c.id)).toMatchObject({ startDate: '2026-12-01', endDate: '2026-12-31', remainingSessions: 14 });
    expect(r.payment).toMatchObject({ amountMinor: 300_000, status: 'due', dueOn: '2026-12-01', method: 'instapay', currency: 'EGP' });
  });

  it('returns null and changes nothing without a package', async () => {
    const { db, repos } = createTestData();
    const c = await repos.clients.create(client({ package: null }));
    expect(await renewPackage(db, repos, c.id, '2026-11-16')).toBeNull();
    expect(await repos.payments.list()).toEqual([]);
  });

  it('is atomic: if recording the charge fails, the client keeps its old dates', async () => {
    const db = new AppDatabase('atomic', fakeIdbOptions());
    let n = 0;
    const repos = createRepositories(db, manualClock(), () => {
      n += 1;
      if (n > 1) throw new Error('boom');
      return `id${n}`;
    });
    const c = await repos.clients.create(client());
    await expect(renewPackage(db, repos, c.id, '2026-11-16')).rejects.toThrow('boom');
    expect(await repos.clients.get(c.id)).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30', remainingSessions: 2 });
    expect(await db.payments.count()).toBe(0);
  });

  it('undoRenewal puts the dates back and removes the charge in one step', async () => {
    const { db, repos } = createTestData();
    const c = await repos.clients.create(client());
    const r = await renewPackage(db, repos, c.id, '2026-11-16');
    if (!r) throw new Error('expected a renewal');
    await undoRenewal(db, repos, c.id, r);
    expect(await repos.clients.get(c.id)).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30', remainingSessions: 2 });
    expect(await repos.payments.list()).toEqual([]);
  });
});
