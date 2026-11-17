import { describe, expect, it } from 'vitest';
import { MAX_REMAINING_SESSIONS, planRenewal } from './renewal';

const base = { totalSessions: 12, priceMinor: 300_000, startDate: '2026-10-22', endDate: '2026-11-21', remainingSessions: 3 };

describe('planRenewal', () => {
  it('a running package continues the day after it ends, same calendar-month length, leftover carried', () => {
    const r = planRenewal(base, '2026-11-16');
    expect(r).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-12-21',
      remainingSessions: 15,
      carriedOver: 3,
      charge: { amountMinor: 300_000, dueOn: '2026-11-22' },
    });
  });
  it('an ended package restarts today without carry-over', () => {
    const r = planRenewal({ ...base, endDate: '2026-11-14', remainingSessions: 2 }, '2026-11-16');
    expect(r.startDate).toBe('2026-11-16');
    expect(r.endDate).toBe('2026-12-09');
    expect(r.remainingSessions).toBe(12);
    expect(r.carriedOver).toBe(0);
  });
  it('without dates uses the default length; without a price records no charge', () => {
    const r = planRenewal({ ...base, startDate: null, endDate: null, priceMinor: 0 }, '2026-11-16');
    expect(r.startDate).toBe('2026-11-16');
    expect(r.endDate).toBe('2026-12-16');
    expect(r.charge).toBeNull();
  });
  it('never plans more sessions than a client can store (carry-over of a big package)', () => {
    const r = planRenewal({ ...base, totalSessions: 600, remainingSessions: 550 }, '2026-11-16');
    expect(r.remainingSessions).toBe(MAX_REMAINING_SESSIONS);
    expect(r.carriedOver).toBe(MAX_REMAINING_SESSIONS - 600);
  });

  it('keeps day-length behaviour for periods that are not whole calendar months', () => {
    const r = planRenewal({ ...base, startDate: '2026-11-01', endDate: '2026-11-20' }, '2026-11-16');
    expect(r.startDate).toBe('2026-11-21');
    expect(r.endDate).toBe('2026-12-10');
  });
});

describe('planRenewal — calendar months', () => {
  const month = (startDate: string, endDate: string, today: string) => planRenewal({ ...base, startDate, endDate }, today);

  it.each([
    // [old start, old end, today, new start, new end]
    ['2026-01-01', '2026-01-31', '2026-01-20', '2026-02-01', '2026-02-28'],
    ['2027-01-01', '2027-01-31', '2027-01-20', '2027-02-01', '2027-02-28'],
    ['2028-01-01', '2028-01-31', '2028-01-20', '2028-02-01', '2028-02-29'],
    ['2026-01-15', '2026-02-14', '2026-02-01', '2026-02-15', '2026-03-14'],
    ['2026-02-01', '2026-02-28', '2026-02-20', '2026-03-01', '2026-03-31'],
    ['2026-12-01', '2026-12-31', '2026-12-30', '2027-01-01', '2027-01-31'],
    ['2026-01-01', '2026-03-31', '2026-03-20', '2026-04-01', '2026-06-30'],
    ['2026-01-31', '2026-02-27', '2026-02-20', '2026-02-28', '2026-03-27'],
  ])('%s–%s renews as %s→%s–%s', (s, e, today, ns, ne) => {
    const r = month(s, e, today);
    expect([r.startDate, r.endDate]).toEqual([ns, ne]);
  });

  it('a monthly package that already ended restarts today for the same number of months', () => {
    const r = month('2026-01-01', '2026-01-31', '2026-03-31');
    expect([r.startDate, r.endDate]).toEqual(['2026-03-31', '2026-04-30']);
  });

  it('renewing monthly packages for a year never drifts off the 1st', () => {
    let pkg = { ...base, startDate: '2026-01-01', endDate: '2026-01-31' };
    for (let i = 0; i < 12; i++) {
      const r = planRenewal(pkg, pkg.endDate);
      pkg = { ...pkg, startDate: r.startDate, endDate: r.endDate };
    }
    expect([pkg.startDate, pkg.endDate]).toEqual(['2027-01-01', '2027-01-31']);
  });
});
