import { describe, expect, it } from 'vitest';
import type { Client, Session } from '@/domain/models';
import { attentionRank, daysSinceCheckIn, packageIndex, planToday } from './homeModel';

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 16, 15, 0);

const client = (over: Partial<Client> = {}) =>
  ({
    id: 'c1',
    name: 'سارة',
    package: { name: '', totalSessions: 12, priceMinor: 0, currency: 'EGP' },
    remainingSessions: 5,
    ...over,
  }) as Client;

const session = (id: string, startOffsetMin: number, over: Partial<Session> = {}) =>
  ({ id, clientId: 'c1', startsAt: NOW + startOffsetMin * MIN, durationMin: 60, attendance: 'scheduled', ...over }) as Session;

describe('planToday', () => {
  it('picks the soonest upcoming session as next and orders the rest', () => {
    const c = client();
    const plan = planToday(
      [
        { session: session('late', 180), client: c },
        { session: session('done', -300, { attendance: 'attended' }), client: c },
        { session: session('next', 40), client: c },
        { session: session('past', -120), client: c },
        { session: session('cancel', 90, { attendance: 'cancelled' }), client: c },
      ],
      NOW,
    );
    expect(plan.next?.session.id).toBe('next');
    expect(plan.next?.minutesUntil).toBe(40);
    expect(plan.next?.packageIndex).toEqual({ n: 8, total: 12 });
    expect(plan.rest.map((r) => r.session.id)).toEqual(['late', 'past', 'done']);
    expect(plan.rest.map((r) => r.status)).toEqual(['upcoming', 'past', 'attended']);
    expect(plan.total).toBe(4);
    expect(plan.done).toBe(2);
  });

  it('treats a session that already started but has not ended as next (running now)', () => {
    const plan = planToday([{ session: session('running', -20), client: client() }], NOW);
    expect(plan.next?.minutesUntil).toBe(-20);
  });

  it('has no next when the day is over', () => {
    expect(planToday([{ session: session('a', -200), client: client() }], NOW).next).toBeNull();
  });
});

describe('packageIndex', () => {
  it('is null without a package and clamps to the package size', () => {
    expect(packageIndex(client({ package: null }))).toBeNull();
    expect(packageIndex(client({ remainingSessions: 0 }))).toEqual({ n: 12, total: 12 });
    expect(packageIndex(client({ remainingSessions: 12 }))).toEqual({ n: 1, total: 12 });
  });
});

describe('helpers', () => {
  it('daysSinceCheckIn', () => {
    expect(daysSinceCheckIn('2026-11-07', '2026-11-16')).toBe(9);
    expect(daysSinceCheckIn(null, '2026-11-16')).toBeNull();
  });
  it('attentionRank puts ended first, then fewest days left', () => {
    const ranks = [
      attentionRank({ kind: 'ending_soon', daysLeft: 5 } as never),
      attentionRank({ kind: 'ended', daysAgo: 2 } as never),
      attentionRank({ kind: 'ending_soon', daysLeft: 1 } as never),
    ];
    expect([...ranks].sort((a, b) => a - b)).toEqual([ranks[1], ranks[2], ranks[0]]);
  });
});
