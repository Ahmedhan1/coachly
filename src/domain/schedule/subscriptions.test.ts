import { describe, expect, it } from 'vitest';
import { expiredBy, expiringWithin } from './subscriptions';

const sub = (id: string, endDate: string) => ({ id, clientId: `c-${id}`, endDate });

describe('expiringWithin', () => {
  const subs = [sub('a', '2026-11-23'), sub('b', '2026-11-16'), sub('c', '2026-11-24'), sub('d', '2026-11-15'), sub('e', 'bad')];

  it('includes today and the 7th day, excludes the 8th and the past, sorted soonest first', () => {
    // today 2026-11-16: b=0, a=7, c=8 (out), d=-1 (out)
    expect(expiringWithin(subs, '2026-11-16', 7).map((e) => [e.subscription.id, e.daysLeft])).toEqual([
      ['b', 0],
      ['a', 7],
    ]);
  });

  it('crosses month boundaries', () => {
    expect(expiringWithin([sub('x', '2026-12-02')], '2026-11-28', 7)[0]?.daysLeft).toBe(4);
  });

  it('expiredBy lists past end dates', () => {
    expect(expiredBy(subs, '2026-11-16').map((s) => s.id)).toEqual(['d']);
  });
});
