import { describe, expect, it } from 'vitest';
import { isBirthdayOn } from './birthday';
import { buildOutbox, type OutboxInput } from './outbox';

describe('isBirthdayOn', () => {
  it('matches month and day', () => {
    expect(isBirthdayOn('1990-11-16', '2026-11-16')).toBe(true);
    expect(isBirthdayOn('1990-11-16', '2026-11-17')).toBe(false);
  });

  it('celebrates a Feb 29 birthday on Feb 28 in common years', () => {
    expect(isBirthdayOn('2000-02-29', '2027-02-28')).toBe(true);
    expect(isBirthdayOn('2000-02-29', '2027-03-01')).toBe(false);
  });

  it('celebrates a Feb 29 birthday only on Feb 29 in leap years', () => {
    expect(isBirthdayOn('2000-02-29', '2028-02-29')).toBe(true);
    expect(isBirthdayOn('2000-02-29', '2028-02-28')).toBe(false);
    expect(isBirthdayOn('2001-02-28', '2028-02-28')).toBe(true);
  });

  it('rejects malformed dates', () => {
    expect(isBirthdayOn('nope', '2026-11-16')).toBe(false);
    expect(isBirthdayOn('1990-11-16', 'nope')).toBe(false);
  });
});

describe('buildOutbox birthdays', () => {
  it('lists a leap-day client in a common year', () => {
    const input: OutboxInput = {
      today: '2027-02-28',
      dateOf: (ms) => new Date(ms).toISOString().slice(0, 10),
      clients: [{ id: 'c', name: 'x', phone: '010', birthDate: '2000-02-29', endDate: null, remainingSessions: 0, hasPackage: false, createdOn: '2026-01-01' }],
      sessions: [],
      payments: [],
      lastCheckIn: new Map(),
      sent: new Set(),
    };
    expect(buildOutbox(input).map((i) => i.id)).toEqual(['birthday:c:2027']);
  });
});
