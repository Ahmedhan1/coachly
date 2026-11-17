import { describe, expect, it } from 'vitest';
import { clientOverview } from './overview';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 17, 12);
const s = (id: string, offsetH: number, attendance: 'scheduled' | 'attended' | 'missed' | 'cancelled' = 'scheduled') => ({
  id,
  startsAt: NOW + offsetH * H,
  durationMin: 60,
  attendance,
});

describe('clientOverview', () => {
  it('summarises sessions left, next and last session, money owed and the last check-in', () => {
    const o = clientOverview({
      client: { package: { totalSessions: 12 }, remainingSessions: 4 },
      sessions: [s('a', -50, 'attended'), s('b', -26, 'attended'), s('n', 30), s('m', 50), s('x', 10, 'cancelled')],
      payments: [
        { status: 'due', amountMinor: 30_000, dueOn: '2026-11-10' },
        { status: 'due', amountMinor: 5_000, dueOn: '2026-11-25' },
        { status: 'paid', amountMinor: 99_000, dueOn: null },
      ],
      lastCheckIn: '2026-11-07',
      now: NOW,
      today: '2026-11-17',
    });
    expect(o.sessionsLeft).toEqual({ left: 4, total: 12, used: 8 });
    expect(o.next?.id).toBe('n');
    expect(o.upcomingCount).toBe(2);
    expect(o.lastAttended?.id).toBe('b');
    expect(o.owedMinor).toBe(35_000);
    expect(o.overdueMinor).toBe(30_000);
    expect(o.checkInDaysAgo).toBe(10);
  });
  it('has no package numbers and no check-in when there are none', () => {
    const o = clientOverview({ client: { package: null, remainingSessions: 0 }, sessions: [], payments: [], lastCheckIn: null, now: NOW, today: '2026-11-17' });
    expect(o.sessionsLeft).toBeNull();
    expect(o.next).toBeNull();
    expect(o.checkInDaysAgo).toBeNull();
  });
});
