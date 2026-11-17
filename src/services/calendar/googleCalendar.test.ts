import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from './googleCalendar';

const params = (url: string) => new URL(url).searchParams;

describe('googleCalendarUrl', () => {
  it('one session: local start/end in Cairo time, title and details', () => {
    const url = googleCalendarUrl(
      { uid: 'a@x', summary: 'حصة سارة', description: 'ملاحظة', start: { date: '2026-11-21', minute: 18 * 60 }, durationMinutes: 60 },
      'Africa/Cairo',
    );
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    const p = params(url);
    expect(p.get('action')).toBe('TEMPLATE');
    expect(p.get('text')).toBe('حصة سارة');
    expect(p.get('details')).toBe('ملاحظة');
    expect(p.get('dates')).toBe('20261121T180000/20261121T190000');
    expect(p.get('ctz')).toBe('Africa/Cairo');
    expect(p.get('recur')).toBeNull();
  });

  it('a session that ends after midnight ends the next day', () => {
    const p = params(googleCalendarUrl({ uid: 'a', summary: 's', start: { date: '2026-12-31', minute: 23 * 60 + 30 }, durationMinutes: 60 }, 'Africa/Cairo'));
    expect(p.get('dates')).toBe('20261231T233000/20270101T003000');
  });

  it('weekly series: first occurrence as the start and an RRULE with BYDAY and COUNT or UNTIL', () => {
    const base = { uid: 'a', summary: 's' };
    const counted = params(
      googleCalendarUrl({ ...base, recurrence: { startDate: '2026-11-17', startMinute: 540, durationMinutes: 45, weekdays: [6, 2], intervalWeeks: 1, count: 8 } }, 'Africa/Cairo'),
    );
    // 2026-11-17 is a Tuesday
    expect(counted.get('dates')).toBe('20261117T090000/20261117T094500');
    expect(counted.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA,TU;WKST=SA;COUNT=8');
    const until = params(
      googleCalendarUrl({ ...base, recurrence: { startDate: '2026-11-17', startMinute: 540, durationMinutes: 45, weekdays: [4], intervalWeeks: 2, until: '2027-01-31' } }, 'Africa/Cairo'),
    );
    expect(until.get('dates')).toBe('20261119T090000/20261119T094500');
    expect(until.get('recur')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;WKST=SA;UNTIL=20270131');
  });
});
