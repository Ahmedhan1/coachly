import { describe, expect, it } from 'vitest';
import { incomeDashboard, type PaymentRecord, type PricedSubscription } from './income';

const pay = (id: string, clientId: string, amountMinor: number, dueDate: string, paidOn: string | null): PaymentRecord => ({
  id,
  clientId,
  amountMinor,
  dueDate,
  paidOn,
});
const sub = (id: string, clientId: string, endDate: string, priceMinor: number): PricedSubscription => ({
  id,
  clientId,
  endDate,
  priceMinor,
});

// Amounts in piastres: 150000 = 1500.00 EGP.
const payments = [
  pay('p1', 'a', 150000, '2026-11-01', '2026-11-02'), // paid this month
  pay('p2', 'b', 200000, '2026-10-25', '2026-11-03'), // October charge paid in November -> counts as paid this month
  pay('p3', 'c', 100000, '2026-10-20', '2026-10-20'), // paid last month -> ignored
  pay('p4', 'd', 120000, '2026-10-28', null), // overdue from last month
  pay('p5', 'e', 80000, '2026-11-10', null), // overdue this month
  pay('p6', 'f', 90000, '2026-11-16', null), // due today -> not overdue yet
  pay('p7', 'g', 70000, '2026-11-30', null), // due later this month
  pay('p8', 'h', 60000, '2026-12-05', null), // next month -> ignored except nothing
];

const subscriptions = [
  sub('s1', 'x', '2026-11-20', 300000), // ends this month, no next charge -> expected renewal
  sub('s2', 'g', '2026-11-25', 250000), // ends this month but client g has a charge due 11-30 -> already recorded
  sub('s3', 'y', '2026-12-01', 400000), // ends next month -> not in this month's renewals, but within 7 days
  sub('s4', 'z', '2026-11-10', 500000), // already ended -> not expected, not renewing soon
];

describe('incomeDashboard (today 2026-11-16)', () => {
  const r = incomeDashboard({ payments, subscriptions, today: '2026-11-16' });
  if (!r.ok) throw new Error(r.error);
  const d = r.value;

  it('month bounds', () => {
    expect([d.monthStart, d.monthEnd]).toEqual(['2026-11-01', '2026-11-30']);
  });

  it('paid this month by paidOn: 150000 + 200000 = 350000', () => {
    expect(d.paidThisMonthMinor).toBe(350000);
  });

  it('overdue: unpaid before today, oldest first: 120000 + 80000 = 200000', () => {
    expect(d.overdue.map((p) => p.id)).toEqual(['p4', 'p5']);
    expect(d.overdueMinor).toBe(200000);
  });

  it('due rest of month (today..30th): 90000 + 70000 = 160000', () => {
    expect(d.dueRestOfMonthMinor).toBe(160000);
  });

  it('expected renewals: only s1 = 300000', () => {
    expect(d.expectedRenewals.map((s) => s.id)).toEqual(['s1']);
    expect(d.expectedRenewalsMinor).toBe(300000);
  });

  it('expected this month = paid 350000 + unpaid due in Nov (80000 + 90000 + 70000 = 240000) + renewals 300000 = 890000', () => {
    expect(d.expectedThisMonthMinor).toBe(890000);
  });

  it('renewing soon within 7 days: s1 (4 days); s2 (9 days) and s3 (15 days) excluded', () => {
    expect(d.renewingSoon.map((e) => [e.subscription.id, e.daysLeft])).toEqual([['s1', 4]]);
  });

  it('renew horizon is configurable', () => {
    const wide = incomeDashboard({ payments, subscriptions, today: '2026-11-16', renewWithinDays: 15 });
    expect(wide.ok && wide.value.renewingSoon.map((e) => e.subscription.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('incomeDashboard edge cases', () => {
  it('empty data gives zeros', () => {
    const r = incomeDashboard({ payments: [], subscriptions: [], today: '2026-02-10' });
    expect(r.ok && r.value).toMatchObject({
      monthEnd: '2026-02-28',
      paidThisMonthMinor: 0,
      overdueMinor: 0,
      dueRestOfMonthMinor: 0,
      expectedThisMonthMinor: 0,
    });
  });

  it('rejects non-integer, negative or unsafe amounts and bad dates', () => {
    expect(incomeDashboard({ payments: [pay('p', 'a', 10.5, '2026-11-01', null)], subscriptions: [], today: '2026-11-16' })).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
    expect(incomeDashboard({ payments: [pay('p', 'a', -1, '2026-11-01', null)], subscriptions: [], today: '2026-11-16' })).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
    expect(incomeDashboard({ payments: [], subscriptions: [sub('s', 'a', '2026-11-20', 2 ** 60)], today: '2026-11-16' })).toEqual({
      ok: false,
      error: 'invalid_amount',
    });
    expect(incomeDashboard({ payments: [pay('p', 'a', 1, '2026-11-31', null)], subscriptions: [], today: '2026-11-16' })).toEqual({
      ok: false,
      error: 'invalid_date',
    });
    expect(incomeDashboard({ payments: [], subscriptions: [], today: 'today' })).toEqual({ ok: false, error: 'invalid_date' });
  });
});
