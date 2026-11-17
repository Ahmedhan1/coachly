import { describe, expect, it } from 'vitest';
import { clientSchema } from './client';
import { addDays, toIsoDate } from './dates';
import { isoDateSchema } from './common';
import { paymentSchema } from './payment';
import { intlZonedClock } from '../schedule';

const base = {
  id: 'c1', name: 'سارة', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
  package: null, startDate: null, endDate: null, remainingSessions: 0, notes: '', photoId: null,
  createdAt: 1, updatedAt: 1, deletedAt: null, demo: false,
};

describe('edge inputs the trainer can type', () => {
  it('Arabic + emoji names are kept as typed (trimmed), and the 120 limit counts characters (code points), so emoji are not double-counted', () => {
    const r = clientSchema.safeParse({ ...base, name: '  منى 💪🏽 حسن  ' });
    expect(r.success && r.data.name).toBe('منى 💪🏽 حسن');
    expect(clientSchema.safeParse({ ...base, name: '💪'.repeat(120) }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, name: '💪'.repeat(121) }).success).toBe(false);
    expect(clientSchema.safeParse({ ...base, name: ' ‏ ' }).success).toBe(true); // RLM alone is not whitespace
  });

  it('very long notes: 10,000 characters are accepted, more are refused (never truncated silently)', () => {
    expect(clientSchema.safeParse({ ...base, notes: 'ن'.repeat(10_000) }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, notes: 'ن'.repeat(10_001) }).success).toBe(false);
  });

  it('zero, negative, fractional, huge and non-finite numbers are refused where they make no sense', () => {
    for (const remainingSessions of [-1, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clientSchema.safeParse({ ...base, remainingSessions }).success).toBe(false);
    }
    for (const weightKg of [0, -70, 401, Number.NaN]) expect(clientSchema.safeParse({ ...base, measurements: { weightKg } }).success).toBe(false);
    const pay = { id: 'p1', clientId: 'c1', currency: 'EGP', status: 'paid', paidOn: '2026-01-01', dueOn: null, method: 'cash', note: '', createdAt: 1, updatedAt: 1, deletedAt: null, demo: false };
    for (const amountMinor of [0, -100, 10.5, 2 ** 60, Number.POSITIVE_INFINITY]) expect(paymentSchema.safeParse({ ...pay, amountMinor }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...pay, amountMinor: 1 }).success).toBe(true);
  });

  it('dates far in the past/future are valid calendar dates; impossible ones are not', () => {
    for (const ok of ['1900-01-01', '2099-12-31', '9999-12-31', '2028-02-29']) expect(isoDateSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['0050-01-01', '2027-02-29', '2026-13-01', '2026-00-10', '+12026-01-01']) expect(isoDateSchema.safeParse(bad).success).toBe(false);
    expect(addDays('9999-12-30', 1)).toBe('9999-12-31');
    expect(addDays('1900-03-01', -1)).toBe('1900-02-28');
    expect(toIsoDate(new Date(2099, 11, 31))).toBe('2099-12-31');
  });

  it('Africa/Cairo DST days: the spring day has 23 hours, the autumn day 25, and dates never skip', () => {
    const clock = intlZonedClock('Africa/Cairo');
    if (!clock.ok) throw new Error(clock.error);
    const c = clock.value;
    const hours = (date: string) => (c.toEpochMs({ date: addDays(date, 1), minute: 0 }) - c.toEpochMs({ date, minute: 0 })) / 3_600_000;
    expect(hours('2025-04-25')).toBe(23);
    expect(hours('2025-10-30')).toBe(25);
    expect(hours('2025-06-15')).toBe(24);
    // Every local midnight across the 2025 transitions maps back to its own date.
    for (let d = '2025-04-20'; d <= '2025-11-05'; d = addDays(d, 1)) {
      expect(c.toLocal(c.toEpochMs({ date: d, minute: 0 })).date).toBe(d);
    }
  });
});
