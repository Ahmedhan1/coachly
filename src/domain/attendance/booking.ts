import { err, ok, type Result } from '../nutrition/result';
import type { RecurrenceRule } from '../models/session';
import { conflictsWith, type Interval } from '../schedule/conflicts';
import { addDays, type IsoDate, type Weekday } from '../schedule/localDate';
import { expandRecurrence, type RecurrenceError, type WeeklyRecurrence } from '../schedule/recurrence';
import type { ZonedClock } from '../schedule/zone';

/**
 * Booking a session or a weekly series. Occurrences are planned in local wall time with the schedule
 * domain (recurrence.ts) and turned into absolute instants with the injected ZonedClock.
 */
export interface BookingRepeat {
  weekdays: readonly Weekday[];
  intervalWeeks: number;
  until: IsoDate | null;
  count: number | null;
}

export interface BookingInput {
  date: IsoDate;
  /** Minutes since local midnight. */
  startMinute: number;
  durationMinutes: number;
  repeat: BookingRepeat | null;
}

export interface PlannedOccurrence {
  date: IsoDate;
  startMs: number;
  durationMinutes: number;
}

/** Open-ended series are materialised this far ahead (the trainer can extend later). */
export const MAX_SERIES_WEEKS = 26;
/** Storage limit of a series (RecurrenceRule.count). */
export const MAX_SERIES_COUNT = 500;

export function weeklyRecurrenceOf(input: BookingInput & { repeat: BookingRepeat }): WeeklyRecurrence {
  return {
    startDate: input.date,
    startMinute: input.startMinute,
    durationMinutes: input.durationMinutes,
    weekdays: input.repeat.weekdays,
    intervalWeeks: input.repeat.intervalWeeks,
    until: input.repeat.until,
    count: input.repeat.count,
  };
}

/** Every occurrence the booking creates (one for a single session). */
export function planOccurrences(input: BookingInput, clock: ZonedClock): Result<PlannedOccurrence[], RecurrenceError> {
  const toPlanned = (date: IsoDate, startMinute: number, durationMinutes: number): PlannedOccurrence => ({
    date,
    startMs: clock.toEpochMs({ date, minute: startMinute }),
    durationMinutes,
  });
  if (!input.repeat) {
    const single = expandRecurrence(
      { startDate: input.date, startMinute: input.startMinute, durationMinutes: input.durationMinutes, weekdays: [0, 1, 2, 3, 4, 5, 6], count: 1 },
      { from: input.date, to: input.date },
    );
    if (!single.ok) return single;
    return ok([toPlanned(input.date, input.startMinute, input.durationMinutes)]);
  }
  const rule = weeklyRecurrenceOf({ ...input, repeat: input.repeat });
  const to = input.repeat.until ?? addDays(input.date, MAX_SERIES_WEEKS * 7 * Math.max(1, input.repeat.intervalWeeks));
  const expanded = expandRecurrence(rule, { from: input.date, to });
  if (!expanded.ok) return expanded;
  const list = expanded.value.slice(0, MAX_SERIES_COUNT);
  if (list.length === 0) return err('no_occurrences');
  return ok(list.map((o) => toPlanned(o.date, o.startMinute, o.durationMinutes)));
}

/** The stored rule for the first session of a series. */
export function recurrenceRuleOf(repeat: BookingRepeat): RecurrenceRule {
  return {
    freq: 'weekly',
    interval: repeat.intervalWeeks,
    byWeekday: [...new Set(repeat.weekdays)].sort((a, b) => a - b),
    until: repeat.until,
    count: repeat.count,
  };
}

export interface BookingConflict<T extends Interval> {
  occurrence: PlannedOccurrence;
  with: T;
}

/**
 * Existing sessions that clash with any planned occurrence (touching ends do not clash).
 * `ignoreIds` are the sessions being edited, so they never clash with themselves.
 */
export function bookingConflicts<T extends Interval>(
  occurrences: readonly PlannedOccurrence[],
  existing: readonly T[],
  ignoreIds: ReadonlySet<string> = new Set(),
): BookingConflict<T>[] {
  const others = existing.filter((e) => !ignoreIds.has(e.id));
  const out: BookingConflict<T>[] = [];
  occurrences.forEach((occurrence, i) => {
    const candidate = { id: `__planned_${i}`, startMs: occurrence.startMs, durationMinutes: occurrence.durationMinutes };
    for (const hit of conflictsWith(candidate, others)) out.push({ occurrence, with: hit });
  });
  return out;
}

/**
 * Dates the stored rule generates that have no live session any more (deleted or cancelled occurrences):
 * exported as EXDATE so the phone calendar matches the app.
 */
export function seriesExceptions(rule: WeeklyRecurrence, liveDates: ReadonlySet<IsoDate>, lastDate: IsoDate): IsoDate[] {
  const expanded = expandRecurrence({ ...rule, exceptions: [] }, { from: rule.startDate, to: rule.until ?? lastDate });
  if (!expanded.ok) return [];
  return expanded.value.map((o) => o.date).filter((d) => !liveDates.has(d));
}
