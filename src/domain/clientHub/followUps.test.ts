import { describe, expect, it } from 'vitest';
import { followUps, isActiveClient } from './followUps';

const TODAY = '2026-11-17';
const pkg = { name: '', totalSessions: 12, priceMinor: 0, currency: 'EGP' };
const c = (id: string, over: Partial<{ package: typeof pkg | null; remainingSessions: number; endDate: string | null }> = {}) => ({
  id,
  package: pkg as typeof pkg | null,
  remainingSessions: 6,
  endDate: '2026-12-30' as string | null,
  ...over,
});

describe('isActiveClient', () => {
  it('needs sessions left and a period that has not ended', () => {
    expect(isActiveClient(c('a'), TODAY)).toBe(true);
    expect(isActiveClient(c('a', { remainingSessions: 0 }), TODAY)).toBe(false);
    expect(isActiveClient(c('a', { endDate: '2026-11-01' }), TODAY)).toBe(false);
    expect(isActiveClient(c('a', { package: null, endDate: null }), TODAY)).toBe(true);
  });
});

describe('followUps', () => {
  it('collects overdue payments, no booking this week and missed check-ins, most urgent first', () => {
    const list = followUps({
      clients: [c('ok'), c('late'), c('quiet'), c('nocheck'), c('ended', { endDate: '2026-10-01' })],
      duePayments: [
        { clientId: 'late', amountMinor: 50_000, dueOn: '2026-11-10', status: 'due' },
        { clientId: 'ok', amountMinor: 10_000, dueOn: '2026-11-30', status: 'due' },
        { clientId: 'ended', amountMinor: 20_000, dueOn: '2026-10-01', status: 'due' },
      ],
      lastCheckIns: new Map([
        ['ok', '2026-11-15'],
        ['late', '2026-11-15'],
        ['quiet', '2026-11-16'],
      ]),
      bookedThisWeek: new Set(['ok', 'late', 'nocheck']),
      today: TODAY,
    });
    expect(list.map((x) => x.clientId)).toEqual(['ended', 'late', 'quiet', 'nocheck']);
    expect(list[1]?.reasons).toEqual([{ kind: 'overdue_payment', amountMinor: 50_000, daysLate: 7 }]);
    expect(list[2]?.reasons).toEqual([{ kind: 'no_session_week' }]);
    expect(list[3]?.reasons).toEqual([{ kind: 'missed_checkin', days: null }]);
  });
});
