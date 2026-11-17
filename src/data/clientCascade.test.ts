import { describe, expect, it } from 'vitest';
import type { Client } from '@/domain/models';
import type { NewEntity } from './repositories';
import { createTestData } from './testing';
import { undoLastDelete } from './undo';

const newClient = (name: string): NewEntity<Client> => ({
  name, phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
  package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: null,
});

async function seed() {
  const t = createTestData();
  const { repos } = t;
  const a = await repos.clients.create(newClient('أ'));
  const b = await repos.clients.create(newClient('ب'));
  const session = (clientId: Client['id'], startsAt: number) =>
    repos.sessions.create({ clientId, startsAt, durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled', programId: null, notes: '' });
  const sa = await session(a.id, 5000);
  const sb = await session(b.id, 6000);
  const due = await repos.payments.create({ clientId: a.id, amountMinor: 500, currency: 'EGP', status: 'due', paidOn: null, dueOn: '2026-11-01', method: 'cash', note: '' });
  const paid = await repos.payments.create({ clientId: a.id, amountMinor: 700, currency: 'EGP', status: 'paid', paidOn: '2026-11-02', dueOn: null, method: 'cash', note: '' });
  const entry = await repos.progress.create({ clientId: a.id, date: '2026-11-01', measurements: {}, photoIds: [], notes: '', source: 'trainer' });
  return { ...t, a, b, sa, sb, due, paid, entry };
}

describe('client delete cascades to the client’s rows', () => {
  it('hides the client’s sessions, unpaid charges and progress; keeps paid income history and other clients', async () => {
    const { repos, a, sb, paid } = await seed();
    await repos.clients.softDelete(a.id);
    expect((await repos.sessions.listBetween(0, 10_000)).map((s) => s.id)).toEqual([sb.id]);
    expect((await repos.payments.list()).map((p) => p.id)).toEqual([paid.id]);
    expect(await repos.progress.listByClient(a.id)).toEqual([]);
  });

  it('restore brings back exactly the rows the delete hid', async () => {
    const { repos, clock, a, sa, sb, due, entry } = await seed();
    const separately = await repos.sessions.create({ clientId: a.id, startsAt: 9000, durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled', programId: null, notes: '' });
    await repos.sessions.softDelete(separately.id);
    clock.advance(10);
    await repos.clients.softDelete(a.id);
    clock.advance(10);
    await repos.clients.restore(a.id);
    expect((await repos.sessions.listBetween(0, 10_000)).map((s) => s.id).sort()).toEqual([sa.id, sb.id].sort());
    expect(await repos.payments.get(due.id)).toBeDefined();
    expect(await repos.progress.get(entry.id)).toBeDefined();
    expect(await repos.sessions.get(separately.id)).toBeUndefined();
  });

  it('undo last delete restores the client together with its rows', async () => {
    const { repos, db, clock, a, sa, due } = await seed();
    await repos.clients.softDelete(a.id);
    expect(await undoLastDelete(db, clock)).toEqual({ table: 'clients', entityId: a.id });
    expect(await repos.clients.get(a.id)).toBeDefined();
    expect(await repos.sessions.get(sa.id)).toBeDefined();
    expect(await repos.payments.get(due.id)).toBeDefined();
    expect(await undoLastDelete(db, clock)).toBeNull();
  });
});
