import { describe, expect, it } from 'vitest';
import { fixedOffsetClock } from '../schedule';
import { buildPushSchedule, PUSH_HORIZON_MS, PUSH_MAX_ITEMS } from './schedule';

const clock = fixedOffsetClock(120); // Cairo winter, UTC+2
const now = Date.UTC(2026, 10, 16, 8, 0); // 10:00 local
const texts = {
  session: (min: number) => ({ title: 'حصة قربت', body: `عندك حصة بعد ${min} دقيقة` }),
  renewal: (days: number) => ({ title: 'اشتراك بيخلص', body: `اشتراك عميل بيخلص بعد ${days} يوم` }),
};

describe('buildPushSchedule', () => {
  it('reminds before each upcoming scheduled session, with generic text only', () => {
    const items = buildPushSchedule({
      now,
      clock,
      leadMinutes: 30,
      renewalDaysBefore: 2,
      renewalMinuteOfDay: 600,
      sessions: [
        { id: 's1', startsAt: now + 2 * 3_600_000, attendance: 'scheduled' },
        { id: 's2', startsAt: now + 10 * 60_000, attendance: 'scheduled' }, // reminder time already passed
        { id: 's3', startsAt: now + 3 * 3_600_000, attendance: 'cancelled' },
      ],
      subscriptions: [],
      texts,
    });
    expect(items).toEqual([{ id: 'ses-s1', at: Math.floor((now + 90 * 60_000) / 1000), title: 'حصة قربت', body: 'عندك حصة بعد 30 دقيقة' }]);
  });

  it('reminds at the chosen local time N days before a subscription ends', () => {
    const items = buildPushSchedule({
      now,
      clock,
      leadMinutes: 30,
      renewalDaysBefore: 2,
      renewalMinuteOfDay: 600,
      sessions: [],
      subscriptions: [{ id: 'c1', endDate: '2026-11-20' }],
      texts,
    });
    // 2026-11-18 10:00 local = 08:00 UTC
    expect(items).toEqual([{ id: 'sub-c1', at: Date.UTC(2026, 10, 18, 8, 0) / 1000, title: 'اشتراك بيخلص', body: 'اشتراك عميل بيخلص بعد 2 يوم' }]);
  });

  it('drops past and too-far items, sorts by time and caps the count', () => {
    const sessions = Array.from({ length: PUSH_MAX_ITEMS + 20 }, (_, i) => ({ id: `x${i}`, startsAt: now + (i + 1) * 3_600_000, attendance: 'scheduled' as const }));
    sessions.push({ id: 'far', startsAt: now + PUSH_HORIZON_MS + 3_600_000, attendance: 'scheduled' });
    const items = buildPushSchedule({ now, clock, leadMinutes: 0, renewalDaysBefore: 2, renewalMinuteOfDay: 600, sessions, subscriptions: [{ id: 'old', endDate: '2026-11-01' }], texts });
    expect(items).toHaveLength(PUSH_MAX_ITEMS);
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort((a, b) => a - b));
    expect(items.some((i) => i.id === 'ses-far' || i.id === 'sub-old')).toBe(false);
  });

  it('keeps ids inside the server pattern', () => {
    const items = buildPushSchedule({
      now,
      clock,
      leadMinutes: 30,
      renewalDaysBefore: 2,
      renewalMinuteOfDay: 600,
      sessions: [{ id: 'a.b/c', startsAt: now + 7_200_000, attendance: 'scheduled' }],
      subscriptions: [],
      texts,
    });
    expect(items[0]?.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});
