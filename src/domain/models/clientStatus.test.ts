import { describe, expect, it } from 'vitest';
import { needsFollowUp, subscriptionAttention } from './clientStatus';
import { addDays, daysBetween, localDayRange, toIsoDate } from './dates';

const pkg = { name: '', totalSessions: 12, priceMinor: 0, currency: 'EGP' };

describe('dates', () => {
  it('counts days across month and leap boundaries', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('formats local dates and day ranges from the given clock', () => {
    const now = new Date(2026, 10, 16, 14, 30);
    expect(toIsoDate(now)).toBe('2026-11-16');
    const r = localDayRange(now);
    expect(r.end - r.start).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(r.start).toBeLessThanOrEqual(now.getTime());
    expect(r.end).toBeGreaterThan(now.getTime());
  });
});

describe('subscriptionAttention', () => {
  const today = '2026-11-16';
  it('flags subscriptions ending within 7 days, inclusive', () => {
    expect(subscriptionAttention({ endDate: '2026-11-23', remainingSessions: 5, package: pkg }, today)).toEqual({
      kind: 'ending_soon',
      daysLeft: 7,
    });
    expect(subscriptionAttention({ endDate: '2026-11-24', remainingSessions: 5, package: pkg }, today)).toBeNull();
    expect(subscriptionAttention({ endDate: today, remainingSessions: 5, package: pkg }, today)).toEqual({
      kind: 'ending_soon',
      daysLeft: 0,
    });
  });
  it('flags ended subscriptions', () => {
    expect(subscriptionAttention({ endDate: '2026-11-10', remainingSessions: 5, package: pkg }, today)).toEqual({
      kind: 'ended',
      daysAgo: 6,
    });
  });
  it('flags low remaining sessions only with a package', () => {
    expect(subscriptionAttention({ endDate: null, remainingSessions: 1, package: pkg }, today)).toEqual({
      kind: 'low_sessions',
      remaining: 1,
    });
    expect(subscriptionAttention({ endDate: null, remainingSessions: 0, package: null }, today)).toBeNull();
  });
});

describe('needsFollowUp', () => {
  it('is true with no check-in or one older than the threshold', () => {
    expect(needsFollowUp(null, '2026-11-16')).toBe(true);
    expect(needsFollowUp('2026-11-01', '2026-11-16')).toBe(true);
    expect(needsFollowUp('2026-11-02', '2026-11-16')).toBe(false);
  });
});
