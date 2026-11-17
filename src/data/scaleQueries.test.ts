import { describe, expect, it } from 'vitest';
import type { NewEntity } from './repositories';
import type { ClientId, Payment, Session } from '@/domain/models';
import { ensureFirstRun, hasDemoData, removeDemoData } from './demoSeed';
import { createTestData } from './testing';

const payment = (clientId: string, extra: Partial<NewEntity<Payment>>): NewEntity<Payment> => ({
  clientId: clientId as ClientId, amountMinor: 100, currency: 'EGP', status: 'paid', paidOn: '2026-01-01', dueOn: null, method: 'cash', note: '', ...extra,
});
const session = (clientId: string, startsAt: number): NewEntity<Session> => ({
  clientId: clientId as ClientId, startsAt, durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled', programId: null, notes: '',
});

describe('index-backed queries for years of data', () => {
  it('payments.listDue returns only live unpaid charges', async () => {
    const { repos } = createTestData();
    await repos.payments.create(payment('c1', {}));
    const due = await repos.payments.create(payment('c1', { status: 'due', paidOn: null, dueOn: '2026-11-01' }));
    const gone = await repos.payments.create(payment('c2', { status: 'due', paidOn: null, dueOn: '2026-11-02' }));
    await repos.payments.softDelete(gone.id);
    expect((await repos.payments.listDue()).map((p) => p.id)).toEqual([due.id]);
  });

  it('payments.listForIncome returns exactly what the income dashboard can use', async () => {
    const { repos } = createTestData();
    const today = '2026-11-16';
    const keep = [
      await repos.payments.create(payment('a', { paidOn: '2026-11-02' })), // paid this month
      await repos.payments.create(payment('b', { status: 'due', paidOn: null, dueOn: '2025-01-01' })), // unpaid, any date
      await repos.payments.create(payment('c', { paidOn: '2026-10-01', dueOn: '2026-12-01' })), // next charge already recorded
      await repos.payments.create(payment('d', { paidOn: '2026-11-30' })), // paid ahead, dated later this month
    ];
    await repos.payments.create(payment('e', { paidOn: '2026-10-31' })); // paid last month: irrelevant
    await repos.payments.create(payment('f', { paidOn: '2023-03-03' })); // years ago: irrelevant
    const deleted = await repos.payments.create(payment('g', { paidOn: '2026-11-05' }));
    await repos.payments.softDelete(deleted.id);
    const ids = (await repos.payments.listForIncome(today)).map((p) => p.id).sort();
    expect(ids).toEqual(keep.map((p) => p.id).sort());
  });

  it('payments.hasAny ignores deleted rows', async () => {
    const { repos } = createTestData();
    expect(await repos.payments.hasAny()).toBe(false);
    const p = await repos.payments.create(payment('a', {}));
    expect(await repos.payments.hasAny()).toBe(true);
    await repos.payments.softDelete(p.id);
    expect(await repos.payments.hasAny()).toBe(false);
  });

  it('sessions.listByClient is time-ordered and skips deleted rows', async () => {
    const { repos } = createTestData();
    const late = await repos.sessions.create(session('c1', 3000));
    const early = await repos.sessions.create(session('c1', 1000));
    await repos.sessions.create(session('c2', 2000));
    const gone = await repos.sessions.create(session('c1', 2000));
    await repos.sessions.softDelete(gone.id);
    expect((await repos.sessions.listByClient('c1')).map((s) => s.id)).toEqual([early.id, late.id]);
  });

  it('hasDemoData does not scan the data once the demo is removed (meta flag), and still sees demo rows', async () => {
    const { repos, db } = createTestData();
    expect(await hasDemoData(db)).toBe(false);
    await ensureFirstRun(repos, db, new Date(2026, 10, 16, 9));
    expect(await hasDemoData(db)).toBe(true);
    await removeDemoData(db);
    for (let i = 0; i < 50; i++) await repos.sessions.create(session('c1', i));
    let scanned = 0;
    const original = db.sessions.filter.bind(db.sessions);
    db.sessions.filter = (fn) => {
      scanned += 1;
      return original(fn);
    };
    expect(await hasDemoData(db)).toBe(false);
    expect(scanned).toBe(0);
  });
});
