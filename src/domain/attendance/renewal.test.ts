import { describe, expect, it } from 'vitest';
import { planRenewal } from './renewal';

const base = { totalSessions: 12, priceMinor: 300_000, startDate: '2026-10-22', endDate: '2026-11-21', remainingSessions: 3 };

describe('planRenewal', () => {
  it('a running package continues the day after it ends, same length, leftover carried', () => {
    const r = planRenewal(base, '2026-11-16');
    expect(r).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-12-22',
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
});
