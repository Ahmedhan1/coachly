import { addDays, DEFAULT_WEEK_START, startOfWeek, type IsoDate, type Weekday } from './localDate';
import type { Session } from './types';
import type { ZonedClock } from './zone';

export interface DayBucket<T> {
  date: IsoDate;
  items: T[];
}

/** Group sessions by local date (in the clock's zone), dates ascending, items by start. */
export function bucketByDay<T extends Pick<Session, 'startMs'>>(sessions: readonly T[], clock: ZonedClock): DayBucket<T>[] {
  const map = new Map<IsoDate, T[]>();
  for (const s of [...sessions].sort((a, b) => a.startMs - b.startMs)) {
    const date = clock.toLocal(s.startMs).date;
    const list = map.get(date);
    if (list) list.push(s);
    else map.set(date, [s]);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, items]) => ({ date, items }));
}

export interface WeekBucket<T> {
  weekStart: IsoDate;
  /** All 7 days of the week, including empty ones, for the week view. */
  days: DayBucket<T>[];
}

/** The 7 dates of the week containing `date`. */
export function weekDates(date: IsoDate, weekStart: Weekday = DEFAULT_WEEK_START): IsoDate[] {
  const first = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function bucketByWeek<T extends Pick<Session, 'startMs'>>(
  sessions: readonly T[],
  clock: ZonedClock,
  weekStart: Weekday = DEFAULT_WEEK_START,
): WeekBucket<T>[] {
  const days = bucketByDay(sessions, clock);
  const weeks = new Map<IsoDate, Map<IsoDate, T[]>>();
  for (const d of days) {
    const ws = startOfWeek(d.date, weekStart);
    let week = weeks.get(ws);
    if (!week) {
      week = new Map(weekDates(ws, weekStart).map((x) => [x, []]));
      weeks.set(ws, week);
    }
    week.set(d.date, d.items);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ws, week]) => ({ weekStart: ws, days: [...week.entries()].map(([date, items]) => ({ date, items })) }));
}
