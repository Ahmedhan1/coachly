import { describe, expect, it } from 'vitest';
import { fixedOffsetClock, intlZonedClock, type ZonedClock } from '../schedule/zone';
import { buildIcs, uidFor, type IcsOptions, type IcsRecurringEvent, type IcsSingleEvent } from './ics';
import { utf8ByteLength } from './text';

function cairo(): ZonedClock {
  const r = intlZonedClock('Africa/Cairo');
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const opts = (patch: Partial<IcsOptions> = {}): IcsOptions => ({ now: new Date('2026-11-16T10:00:00Z'), clock: cairo(), ...patch });

const single: IcsSingleEvent = {
  uid: uidFor('sess-1'),
  summary: 'حصة أحمد: جلوتس, كوادز; هامسترينج',
  description: 'السطر الأول\nالسطر الثاني',
  location: 'Gym, Nasr City',
  start: { date: '2026-11-16', minute: 18 * 60 },
  durationMinutes: 60,
};

const weekly: IcsRecurringEvent = {
  uid: uidFor('series-1'),
  summary: 'حصة متكررة',
  recurrence: {
    startDate: '2026-11-15', // Sunday; first matching day is Monday 16th
    startMinute: 18 * 60 + 30,
    durationMinutes: 45,
    weekdays: [1, 3, 6],
    until: '2027-12-31',
    exceptions: ['2026-11-23', '2026-11-18'],
  },
  alarmMinutesBefore: 15,
};

function build(...args: Parameters<typeof buildIcs>): string {
  const r = buildIcs(...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** Unfold (RFC 5545 §3.1) and split into logical lines. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter((l) => l !== '');
}

describe('buildIcs: structure', () => {
  const ics = build([single], opts());

  it('uses CRLF only and ends with CRLF', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('every physical line is at most 75 octets and is valid UTF-8 on its own', () => {
    for (const line of ics.split('\r\n')) {
      expect(utf8ByteLength(line)).toBeLessThanOrEqual(75);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(line))).toBe(line);
    }
  });

  it('single event with TZID, DTEND, stable UID, UTC DTSTAMP and escaped text', () => {
    const lines = unfold(ics);
    expect(lines.slice(0, 2)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0']);
    expect(lines).toContain('UID:sess-1@pt-coach.app');
    expect(lines).toContain('DTSTAMP:20261116T100000Z');
    expect(lines).toContain('DTSTART;TZID=Africa/Cairo:20261116T180000');
    expect(lines).toContain('DTEND;TZID=Africa/Cairo:20261116T190000');
    expect(lines).toContain('SUMMARY:حصة أحمد: جلوتس\\, كوادز\\; هامسترينج');
    expect(lines).toContain('DESCRIPTION:السطر الأول\\nالسطر الثاني');
    expect(lines).toContain('LOCATION:Gym\\, Nasr City');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.some((l) => l.startsWith('RRULE'))).toBe(false);
  });

  it('default alarm is 30 minutes before, as a DISPLAY VALARM', () => {
    const lines = unfold(ics);
    const i = lines.indexOf('BEGIN:VALARM');
    expect(lines.slice(i, i + 5)).toEqual([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:حصة أحمد: جلوتس\\, كوادز\\; هامسترينج',
      'TRIGGER:-PT30M',
      'END:VALARM',
    ]);
  });

  it('is deterministic for the same input (stable output, stable UID)', () => {
    expect(build([single], opts())).toBe(ics);
  });

  it('alarm configurable, disabled with null, at-start with 0', () => {
    expect(unfold(build([{ ...single, alarmMinutesBefore: 90 }], opts()))).toContain('TRIGGER:-PT90M');
    expect(unfold(build([{ ...single, alarmMinutesBefore: 0 }], opts()))).toContain('TRIGGER:PT0M');
    expect(build([{ ...single, alarmMinutesBefore: null }], opts())).not.toContain('VALARM');
    expect(build([single], opts({ defaultAlarmMinutesBefore: null }))).not.toContain('VALARM');
    expect(unfold(build([single], opts({ defaultAlarmMinutesBefore: 10 })))).toContain('TRIGGER:-PT10M');
  });
});

describe('buildIcs: recurring event', () => {
  const lines = unfold(build([weekly], opts()));

  it('DTSTART is the first real occurrence; RRULE with BYDAY, WKST and UTC UNTIL', () => {
    expect(lines).toContain('DTSTART;TZID=Africa/Cairo:20261116T183000');
    expect(lines).toContain('DTEND;TZID=Africa/Cairo:20261116T191500');
    // until 2027-12-31 23:59:59 Cairo (+02:00 in winter) = 21:59:59Z
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA,MO,WE;WKST=SA;UNTIL=20271231T215959Z');
    expect(lines).toContain('TRIGGER:-PT15M');
  });

  it('EXDATE lists sorted exceptions at the series start time', () => {
    expect(lines).toContain('EXDATE;TZID=Africa/Cairo:20261118T183000,20261123T183000');
  });

  it('INTERVAL and COUNT', () => {
    const l = unfold(
      build([{ ...weekly, recurrence: { ...weekly.recurrence, until: null, count: 10, intervalWeeks: 2, exceptions: [] } }], opts()),
    );
    expect(l).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,MO,WE;WKST=SA;COUNT=10');
    expect(l.some((x) => x.startsWith('EXDATE'))).toBe(false);
  });

  it('VTIMEZONE carries Egypt 2027 DST start and end transitions', () => {
    const tz = lines.slice(lines.indexOf('BEGIN:VTIMEZONE'), lines.indexOf('END:VTIMEZONE') + 1);
    expect(tz[1]).toBe('TZID:Africa/Cairo');
    // DST starts Friday 2027-04-30 00:00 (+0200 -> +0300)
    expect(tz.join('\n')).toContain(
      ['BEGIN:DAYLIGHT', 'DTSTART:20270430T000000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'END:DAYLIGHT'].join('\n'),
    );
    // DST ends at the end of Thursday 2027-10-28, i.e. local (EEST) Friday 2027-10-29 00:00
    expect(tz.join('\n')).toContain(
      ['BEGIN:STANDARD', 'DTSTART:20271029T000000', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'END:STANDARD'].join('\n'),
    );
  });
});

describe('buildIcs: options and errors', () => {
  it('custom TZID with a fixed-offset zone produces a single STANDARD component', () => {
    const l = unfold(build([single], opts({ timeZone: 'Asia/Riyadh', clock: fixedOffsetClock(180) })));
    expect(l).toContain('DTSTART;TZID=Asia/Riyadh:20261116T180000');
    expect(l.filter((x) => x === 'BEGIN:STANDARD')).toHaveLength(1);
    expect(l.some((x) => x === 'BEGIN:DAYLIGHT')).toBe(false);
    expect(l).toContain('TZOFFSETTO:+0300');
  });

  it('multiple events share one VTIMEZONE', () => {
    const l = unfold(build([single, weekly], opts()));
    expect(l.filter((x) => x === 'BEGIN:VTIMEZONE')).toHaveLength(1);
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('long Arabic summary folds and unfolds back to the original', () => {
    const summary = 'تمرين '.repeat(30).trim();
    const ics = build([{ ...single, summary }], opts());
    expect(ics.split('\r\n').length).toBeGreaterThan(unfold(ics).length);
    expect(unfold(ics)).toContain(`SUMMARY:${summary}`);
  });

  it.each([
    [[], 'no_events'],
    [[{ ...single, uid: ' ' }], 'invalid_uid'],
    [[{ ...single, durationMinutes: 0 }], 'invalid_duration'],
    [[{ ...single, start: { date: '2026-13-01', minute: 0 } }], 'invalid_start'],
    [[{ ...single, alarmMinutesBefore: -5 }], 'invalid_alarm'],
    [[{ ...weekly, recurrence: { ...weekly.recurrence, weekdays: [] } }], 'no_weekdays'],
  ] as const)('rejects bad input (%#)', (events, error) => {
    expect(buildIcs(events, opts())).toEqual({ ok: false, error });
  });
});
