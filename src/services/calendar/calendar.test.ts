import { describe, expect, it } from 'vitest';
import { uidFor, type IcsOptions, type IcsRecurringEvent, type IcsSingleEvent } from '@/domain/calendar';
import { intlZonedClock } from '@/domain/schedule/zone';
import { FakeShareService } from '@/services/share/shareService';
import { IcsCalendarService, makeIcsFile } from './calendarService';

function opts(): IcsOptions {
  const clock = intlZonedClock('Africa/Cairo');
  if (!clock.ok) throw new Error(clock.error);
  return { now: new Date('2026-11-16T10:00:00Z'), clock: clock.value };
}

const single: IcsSingleEvent = {
  uid: uidFor('sess-1'),
  summary: 'حصة سارة: جلوتس',
  start: { date: '2026-11-18', minute: 18 * 60 },
  durationMinutes: 60,
};

const series: IcsRecurringEvent = {
  uid: uidFor('series-1'),
  summary: 'حصص منى',
  recurrence: { startDate: '2026-11-15', startMinute: 19 * 60, durationMinutes: 45, weekdays: [0, 3], until: '2027-02-28', exceptions: [] },
};

describe('calendar service', () => {
  it('assembles an .ics file: name, MIME, UTF-8 Arabic content', async () => {
    const file = makeIcsFile('BEGIN:VCALENDAR\r\nSUMMARY:حصة\r\nEND:VCALENDAR\r\n', 'حصة سارة / الأربعاء');
    expect(file.fileName).toBe('حصة سارة - الأربعاء.ics');
    expect(file.mimeType).toBe('text/calendar');
    expect(file.blob.type).toBe('text/calendar;charset=utf-8');
    expect(await file.blob.text()).toContain('SUMMARY:حصة');
    expect(makeIcsFile('x', 'a.ICS').fileName).toBe('a.ics');
    expect(makeIcsFile('x', '').fileName).toBe('session.ics');
  });

  it('shares one event', async () => {
    const share = new FakeShareService();
    const service = new IcsCalendarService(share);
    const r = await service.addToCalendar([single], opts(), 'حصة سارة', { title: 'حصة' });
    expect(r.ok && r.value.share).toEqual({ outcome: 'shared' });
    const sent = share.requests[0]!;
    expect(sent).toMatchObject({ fileName: 'حصة سارة.ics', mimeType: 'text/calendar', title: 'حصة' });
    const text = await sent.data.text();
    expect(text).toContain('BEGIN:VEVENT');
    expect(text).toContain('DTSTART;TZID=Africa/Cairo:20261118T180000');
    expect(text).toContain('BEGIN:VALARM');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('shares a recurring series', async () => {
    const share = new FakeShareService({ outcome: 'downloaded' });
    const r = await new IcsCalendarService(share).addToCalendar([series], opts(), 'حصص منى', { prefer: 'download' });
    expect(r.ok && r.value.share).toEqual({ outcome: 'downloaded' });
    const text = await share.requests[0]!.data.text();
    expect(text).toMatch(/RRULE:FREQ=WEEKLY;[^\r\n]*BYDAY=SU,WE/);
    expect(text).toContain('BEGIN:VTIMEZONE');
  });

  it('returns the domain error without sharing', async () => {
    const share = new FakeShareService();
    const r = await new IcsCalendarService(share).addToCalendar([], opts(), 'x');
    expect(r).toEqual({ ok: false, error: 'no_events' });
    expect(share.requests).toHaveLength(0);
  });
});
