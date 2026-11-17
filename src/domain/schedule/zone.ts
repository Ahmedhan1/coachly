import { err, ok, type Result } from '../nutrition/result';
import { fromDayNumber, toDayNumber, type IsoDate } from './localDate';

/**
 * How the schedule handles time zones and DST
 * ------------------------------------------
 * Sessions are planned in *local wall time*: a date (`YYYY-MM-DD`) plus minutes since local midnight.
 * Recurrence, day/week bucketing and "today" are pure integer arithmetic on those values, so a weekly
 * 18:00 session stays at 18:00 on both sides of a DST change (Egypt has DST again since 2023).
 *
 * Only when an absolute instant is needed (conflict detection, notifications, UTC timestamps in .ics)
 * do we cross into epoch milliseconds through a `ZonedClock`. The clock is injected, so tests use a
 * fixed-offset clock and the app uses `intlZonedClock('Africa/Cairo')`, which reads tz rules from the
 * ECMAScript Intl API (no DOM, no device-zone dependency).
 *
 * Wall times that do not exist (spring-forward gap) resolve with the offset in force *before* the gap,
 * i.e. they move forward by the gap length; ambiguous wall times (fall-back overlap) resolve to the
 * earlier instant. Both match RFC 5545 §3.3.5.
 */
export interface LocalDateTime {
  date: IsoDate;
  /** Minutes since local midnight, 0..1439. */
  minute: number;
}

export interface ZonedClock {
  /** UTC offset in minutes (east positive) at an instant. */
  offsetMinutesAt(epochMs: number): number;
  toEpochMs(local: LocalDateTime): number;
  toLocal(epochMs: number): LocalDateTime;
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

/** Local wall time read as if it were UTC, in ms. */
export function wallMs(local: LocalDateTime): number {
  return toDayNumber(local.date) * MS_PER_DAY + local.minute * MS_PER_MIN;
}

export function wallMsToLocal(ms: number): LocalDateTime {
  const day = Math.floor(ms / MS_PER_DAY);
  return { date: fromDayNumber(day), minute: Math.floor((ms - day * MS_PER_DAY) / MS_PER_MIN) };
}

function clockFromOffsets(offsetMinutesAt: (epochMs: number) => number): ZonedClock {
  return {
    offsetMinutesAt,
    toLocal: (epochMs) => wallMsToLocal(epochMs + offsetMinutesAt(epochMs) * MS_PER_MIN),
    toEpochMs: (local) => {
      const w = wallMs(local);
      // Assumes at most one transition within ±1 day, which holds for every real zone.
      const before = offsetMinutesAt(w - MS_PER_DAY);
      const after = offsetMinutesAt(w + MS_PER_DAY);
      const candidates = [w - before * MS_PER_MIN, w - after * MS_PER_MIN].filter(
        (t) => wallMs(wallMsToLocal(t + offsetMinutesAt(t) * MS_PER_MIN)) === w,
      );
      if (candidates.length === 0) return w - before * MS_PER_MIN; // gap
      return Math.min(...candidates); // overlap -> earlier instant
    },
  };
}

export function fixedOffsetClock(offsetMinutes: number): ZonedClock {
  return clockFromOffsets(() => offsetMinutes);
}

/** Build a clock from an arbitrary offset function (handy for tests with a synthetic DST rule). */
export function clockFromOffsetFunction(offsetMinutesAt: (epochMs: number) => number): ZonedClock {
  return clockFromOffsets(offsetMinutesAt);
}

export const DEFAULT_TIME_ZONE = 'Africa/Cairo';

/** Clock for an IANA zone using Intl. Returns an error for unknown zones. */
export function intlZonedClock(timeZone: string = DEFAULT_TIME_ZONE): Result<ZonedClock, 'invalid_time_zone'> {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    return err('invalid_time_zone');
  }
  const offsetMinutesAt = (epochMs: number): number => {
    const parts: Record<string, number> = {};
    for (const p of fmt.formatToParts(new Date(epochMs))) {
      if (p.type !== 'literal') parts[p.type] = Number(p.value);
    }
    const asUtc = Date.UTC(
      parts.year ?? 1970,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
    );
    const flooredInstant = Math.floor(epochMs / 1000) * 1000;
    return Math.round((asUtc - flooredInstant) / MS_PER_MIN);
  };
  return ok(clockFromOffsets(offsetMinutesAt));
}

/** Local calendar date at `now` (the caller passes the clock reading in). */
export function localDateAt(now: Date, clock: ZonedClock): IsoDate {
  return clock.toLocal(now.getTime()).date;
}
