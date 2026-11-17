import { err, ok, type Result } from '../nutrition/result';
import {
  DEFAULT_WEEK_START,
  fromDayNumber,
  isIsoDate,
  toDayNumber,
  weekdayOf,
  type IsoDate,
  type Weekday,
} from './localDate';
import type { Session } from './types';
import type { ZonedClock } from './zone';

/**
 * Weekly recurrence in local wall time (see zone.ts for the DST approach).
 * Semantics follow RFC 5545 FREQ=WEEKLY;INTERVAL;BYDAY;WKST;UNTIL|COUNT with EXDATE, so the same rule
 * can be exported to .ics and the phone calendar shows exactly the sessions the app shows:
 * - weeks are counted from the week (starting `weekStart`) that contains `startDate`;
 * - `until` is an inclusive date;
 * - `count` counts generated occurrences *before* exceptions are removed (RFC 5545 EXDATE behaviour).
 */
export interface WeeklyRecurrence {
  startDate: IsoDate;
  /** Minutes since local midnight. */
  startMinute: number;
  durationMinutes: number;
  weekdays: readonly Weekday[];
  intervalWeeks?: number;
  until?: IsoDate | null;
  count?: number | null;
  exceptions?: readonly IsoDate[];
  weekStart?: Weekday;
}

export interface Occurrence {
  date: IsoDate;
  startMinute: number;
  durationMinutes: number;
}

export type RecurrenceError =
  | 'invalid_date'
  | 'invalid_start_minute'
  | 'invalid_duration'
  | 'no_weekdays'
  | 'invalid_interval'
  | 'invalid_count'
  | 'until_before_start'
  | 'no_occurrences';

export function validateRecurrence(r: WeeklyRecurrence): RecurrenceError | null {
  if (!isIsoDate(r.startDate)) return 'invalid_date';
  if (r.until != null && !isIsoDate(r.until)) return 'invalid_date';
  if ((r.exceptions ?? []).some((d) => !isIsoDate(d))) return 'invalid_date';
  if (!Number.isInteger(r.startMinute) || r.startMinute < 0 || r.startMinute >= 1440) return 'invalid_start_minute';
  if (!Number.isInteger(r.durationMinutes) || r.durationMinutes <= 0) return 'invalid_duration';
  if (r.weekdays.length === 0 || r.weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) return 'no_weekdays';
  const interval = r.intervalWeeks ?? 1;
  if (!Number.isInteger(interval) || interval < 1) return 'invalid_interval';
  if (r.count != null && (!Number.isInteger(r.count) || r.count < 1)) return 'invalid_count';
  if (r.until != null && r.until < r.startDate) return 'until_before_start';
  return null;
}

/** Safety cap for open-ended series when no range end bounds the loop. */
const MAX_SCAN_DAYS = 366 * 20;

/**
 * Occurrences whose date lies in [from, to] (inclusive). Pure Y/M/D arithmetic: no Date, no zone.
 */
export function expandRecurrence(
  r: WeeklyRecurrence,
  range: { from: IsoDate; to: IsoDate },
): Result<Occurrence[], RecurrenceError> {
  const invalid = validateRecurrence(r);
  if (invalid) return err(invalid);
  if (!isIsoDate(range.from) || !isIsoDate(range.to)) return err('invalid_date');

  const start = toDayNumber(r.startDate);
  const weekStart = r.weekStart ?? DEFAULT_WEEK_START;
  const firstWeek = start - ((weekdayOf(r.startDate) - weekStart + 7) % 7);
  const interval = r.intervalWeeks ?? 1;
  const days = new Set<number>(r.weekdays);
  const exceptions = new Set(r.exceptions ?? []);
  const from = toDayNumber(range.from);
  let last = Math.min(toDayNumber(range.to), start + MAX_SCAN_DAYS);
  if (r.until != null) last = Math.min(last, toDayNumber(r.until));

  const out: Occurrence[] = [];
  let generated = 0;
  for (let n = start; n <= last; n++) {
    const weekIndex = Math.floor((n - firstWeek) / 7);
    if (weekIndex % interval !== 0) continue;
    const date = fromDayNumber(n);
    if (!days.has(weekdayOf(date))) continue;
    generated++;
    if (r.count != null && generated > r.count) break;
    if (n >= from && !exceptions.has(date)) {
      out.push({ date, startMinute: r.startMinute, durationMinutes: r.durationMinutes });
    }
  }
  return ok(out);
}

/** First generated occurrence (ignoring exceptions), used as DTSTART when exporting. */
export function firstOccurrenceDate(r: WeeklyRecurrence): Result<IsoDate, RecurrenceError> {
  const invalid = validateRecurrence(r);
  if (invalid) return err(invalid);
  const probe = expandRecurrence(
    { ...r, exceptions: [], count: 1 },
    { from: r.startDate, to: fromDayNumber(toDayNumber(r.startDate) + 7 * (r.intervalWeeks ?? 1) + 7) },
  );
  if (!probe.ok) return probe;
  const first = probe.value[0];
  return first ? ok(first.date) : err('no_occurrences');
}

/** Turn wall-time occurrences into absolute sessions. `idFor` builds a stable id per date. */
export function occurrencesToSessions(
  occurrences: readonly Occurrence[],
  clock: ZonedClock,
  clientId: string,
  idFor: (date: IsoDate) => string,
): Session[] {
  return occurrences.map((o) => ({
    id: idFor(o.date),
    clientId,
    startMs: clock.toEpochMs({ date: o.date, minute: o.startMinute }),
    durationMinutes: o.durationMinutes,
  }));
}
