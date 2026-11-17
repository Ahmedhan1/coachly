import { err, ok, type Result } from '../nutrition/result';
import { firstOccurrenceDate, validateRecurrence, type RecurrenceError, type WeeklyRecurrence } from '../schedule/recurrence';
import { addDays, isIsoDate, toDayNumber, type Weekday } from '../schedule/localDate';
import { DEFAULT_TIME_ZONE, wallMs, wallMsToLocal, type LocalDateTime, type ZonedClock } from '../schedule/zone';
import { formatLocal, formatUtc } from './format';
import { escapeText, serializeLines } from './text';
import { buildVTimezone } from './vtimezone';

/*
 * Time representation choice: local times with TZID (default Africa/Cairo) plus a generated VTIMEZONE.
 *
 * UTC times (`...Z`) would be simpler, but a weekly RRULE anchored in UTC keeps the *UTC* time fixed, so
 * after Egypt's DST change every recurring session would show one hour off on the iPhone. With
 * TZID=<Olson name>, iOS/macOS Calendar match the id against their own tz database and keep the wall-clock
 * time across DST; the embedded VTIMEZONE keeps the file valid RFC 5545 for clients that need it
 * (Google Calendar, Outlook). DTSTAMP and UNTIL are UTC, as RFC 5545 requires.
 */

export interface IcsEventBase {
  /** Stable id: use `uidFor(sessionId)` so re-exporting updates the same event. */
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** Minutes before start; `null` disables the alarm; `undefined` uses the calendar default. */
  alarmMinutesBefore?: number | null;
  sequence?: number;
}

export interface IcsSingleEvent extends IcsEventBase {
  start: LocalDateTime;
  durationMinutes: number;
}

export interface IcsRecurringEvent extends IcsEventBase {
  recurrence: WeeklyRecurrence;
}

export type IcsEvent = IcsSingleEvent | IcsRecurringEvent;

export interface IcsOptions {
  /** Used for DTSTAMP. */
  now: Date;
  /** Must be the clock for `timeZone`. */
  clock: ZonedClock;
  timeZone?: string;
  defaultAlarmMinutesBefore?: number | null;
  prodId?: string;
  calendarName?: string;
  /** How far past the start a VTIMEZONE covers open-ended series. */
  timeZoneYearsAhead?: number;
}

export const DEFAULT_ALARM_MINUTES_BEFORE = 30;
export const DEFAULT_PROD_ID = '-//PT Coach//Sessions//AR';
export const DEFAULT_UID_DOMAIN = 'pt-coach.app';
export const DEFAULT_TZ_YEARS_AHEAD = 3;

export type IcsError = RecurrenceError | 'no_events' | 'invalid_alarm' | 'invalid_duration' | 'invalid_start' | 'invalid_uid';

const BYDAY: Record<Weekday, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };

export function uidFor(sessionId: string, domain: string = DEFAULT_UID_DOMAIN): string {
  return `${sessionId}@${domain}`;
}

function alarmFor(e: IcsEvent, opts: IcsOptions): number | null {
  if (e.alarmMinutesBefore !== undefined) return e.alarmMinutesBefore;
  return opts.defaultAlarmMinutesBefore === undefined ? DEFAULT_ALARM_MINUTES_BEFORE : opts.defaultAlarmMinutesBefore;
}

function isRecurring(e: IcsEvent): e is IcsRecurringEvent {
  return 'recurrence' in e;
}

interface Timing {
  start: LocalDateTime;
  durationMinutes: number;
  lastDate: string | null;
}

function timingOf(e: IcsEvent): Result<Timing, IcsError> {
  if (!isRecurring(e)) {
    const { start, durationMinutes } = e;
    if (!isIsoDate(start.date) || !Number.isInteger(start.minute) || start.minute < 0 || start.minute >= 1440) {
      return err('invalid_start');
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return err('invalid_duration');
    return ok({ start, durationMinutes, lastDate: start.date });
  }
  const r = e.recurrence;
  const invalid = validateRecurrence(r);
  if (invalid) return err(invalid);
  const first = firstOccurrenceDate(r);
  if (!first.ok) return first;
  return ok({ start: { date: first.value, minute: r.startMinute }, durationMinutes: r.durationMinutes, lastDate: r.until ?? null });
}

function tzProp(name: string, tzid: string, local: LocalDateTime): string {
  return `${name};TZID=${tzid}:${formatLocal(local)}`;
}

function rruleOf(r: WeeklyRecurrence, clock: ZonedClock): string {
  const order: Weekday[] = [6, 0, 1, 2, 3, 4, 5];
  const parts = ['FREQ=WEEKLY'];
  const interval = r.intervalWeeks ?? 1;
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  parts.push(`BYDAY=${order.filter((d) => r.weekdays.includes(d)).map((d) => BYDAY[d]).join(',')}`);
  parts.push(`WKST=${BYDAY[r.weekStart ?? 6]}`);
  if (r.until != null) {
    // Inclusive date -> last second of that local day, in UTC (RFC 5545: UTC when DTSTART has TZID).
    parts.push(`UNTIL=${formatUtc(clock.toEpochMs({ date: r.until, minute: 1439 }) + 59_000)}`);
  } else if (r.count != null) {
    parts.push(`COUNT=${r.count}`);
  }
  return `RRULE:${parts.join(';')}`;
}

function alarmLines(minutes: number, summary: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:${minutes === 0 ? 'PT0M' : `-PT${minutes}M`}`, 'END:VALARM'];
}

function eventLines(e: IcsEvent, t: Timing, tzid: string, opts: IcsOptions, alarm: number | null): string[] {
  const end = wallMsToLocal(wallMs(t.start) + t.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(e.uid)}`,
    `DTSTAMP:${formatUtc(opts.now.getTime())}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    tzProp('DTSTART', tzid, t.start),
    tzProp('DTEND', tzid, end),
    `SUMMARY:${escapeText(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (isRecurring(e)) {
    lines.push(rruleOf(e.recurrence, opts.clock));
    const ex = [...new Set(e.recurrence.exceptions ?? [])].sort();
    if (ex.length > 0) {
      lines.push(`EXDATE;TZID=${tzid}:${ex.map((d) => formatLocal({ date: d, minute: t.start.minute })).join(',')}`);
    }
  }
  if (alarm !== null) lines.push(...alarmLines(alarm, e.summary));
  lines.push('END:VEVENT');
  return lines;
}

/** Build a complete VCALENDAR (CRLF, folded) for one or more events. */
export function buildIcs(events: readonly IcsEvent[], opts: IcsOptions): Result<string, IcsError> {
  if (events.length === 0) return err('no_events');
  const tzid = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const timings: Timing[] = [];
  for (const e of events) {
    if (e.uid.trim() === '') return err('invalid_uid');
    const alarm = alarmFor(e, opts);
    if (alarm != null && (!Number.isInteger(alarm) || alarm < 0)) return err('invalid_alarm');
    const t = timingOf(e);
    if (!t.ok) return t;
    timings.push(t.value);
  }

  const yearsAhead = opts.timeZoneYearsAhead ?? DEFAULT_TZ_YEARS_AHEAD;
  const firstDay = Math.min(...timings.map((t) => toDayNumber(t.start.date)));
  const lastDay = Math.max(
    ...timings.map((t) => (t.lastDate ? toDayNumber(t.lastDate) : toDayNumber(addDays(t.start.date, yearsAhead * 366)))),
  );
  const fromMs = (firstDay - 1) * 86_400_000;
  const toMs = (lastDay + 2) * 86_400_000;

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${opts.prodId ?? DEFAULT_PROD_ID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (opts.calendarName) lines.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  lines.push(...buildVTimezone(tzid, opts.clock, fromMs, toMs));
  events.forEach((e, i) => {
    const t = timings[i];
    if (!t) return;
    lines.push(...eventLines(e, t, tzid, opts, alarmFor(e, opts)));
  });
  lines.push('END:VCALENDAR');
  return ok(serializeLines(lines));
}
