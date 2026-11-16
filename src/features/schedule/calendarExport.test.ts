import { describe, expect, it } from 'vitest';
import { buildIcs } from '@/domain/calendar';
import type { Session } from '@/domain/models';
import { intlZonedClock } from '@/domain/schedule';
import { calendarEventFor, icsOptions } from './calendarExport';

const zone = intlZonedClock('Africa/Cairo');
if (!zone.ok) throw new Error('zone');
const clock = zone.value;
const at = (iso: string) => new Date(iso).getTime();

const session = (id: string, startsAt: number, extra: Partial<Session> = {}): Session =>
  ({
    id, clientId: 'c1', startsAt, durationMin: 60, recurrence: null, seriesId: null, attendance: 'scheduled', programId: null,
    notes: '', createdAt: 0, updatedAt: 0, deletedAt: null, demo: false, ...extra,
  }) as Session;

const base = { clientName: 'سارة محمود', clock, timeZone: 'Africa/Cairo', alarmMinutesBefore: 60, now: new Date('2026-11-16T10:00:00Z') };

describe('calendarEventFor', () => {
  it('a single session becomes one event with the alarm', () => {
    const s = session('s1', at('2026-11-18T18:00:00+02:00'));
    const ev = calendarEventFor({ ...base, session: s, clientSessions: [s] });
    const ics = buildIcs([ev], icsOptions(base));
    expect(ics.ok && ics.value).toContain('DTSTART;TZID=Africa/Cairo:20261118T180000');
    expect(ics.ok && ics.value).toContain('TRIGGER:-PT60M');
    expect(ics.ok && ics.value).not.toContain('RRULE');
  });

  it('a series member exports the series rule with deleted occurrences as EXDATE', () => {
    const rule = { freq: 'weekly' as const, interval: 1, byWeekday: [6], until: null, count: 3 };
    const head = session('h', at('2026-11-21T09:00:00+02:00'), { seriesId: 'h' as Session['seriesId'], recurrence: rule });
    const third = session('x3', at('2026-12-05T09:00:00+02:00'), { seriesId: 'h' as Session['seriesId'] });
    const ev = calendarEventFor({ ...base, session: third, clientSessions: [head, third] });
    const ics = buildIcs([ev], icsOptions(base));
    if (!ics.ok) throw new Error(ics.error);
    expect(ics.value).toMatch(/RRULE:FREQ=WEEKLY;BYDAY=SA;WKST=SA;COUNT=3/);
    expect(ics.value).toContain('EXDATE;TZID=Africa/Cairo:20261128T090000');
    expect(ics.value).toContain('BEGIN:VALARM');
  });
});
