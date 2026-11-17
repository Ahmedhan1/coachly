import { daysInMonth, formatIsoDate, parseIsoDate, type IsoDate } from '../schedule/localDate';

/** Longest package recognised as a whole-month span. */
export const MAX_PACKAGE_MONTHS = 24;

/**
 * Last day of an `n`-calendar-month period starting on `start`: the day before the same day-of-month `n`
 * months later, clamped to that month's length (Jan 15 → Feb 14, Jan 1 → Jan 31, Mar 31 → Apr 30,
 * Jan 31 → Feb 28/29).
 */
export function monthPeriodEnd(start: IsoDate, months: number): IsoDate | null {
  const s = parseIsoDate(start);
  if (!s || !Number.isInteger(months) || months < 1) return null;
  if (s.day === 1) {
    const idx = s.year * 12 + (s.month - 1) + months - 1;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    return formatIsoDate({ year, month, day: daysInMonth(year, month) });
  }
  const idx = s.year * 12 + (s.month - 1) + months;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return formatIsoDate({ year, month, day: Math.min(s.day - 1, daysInMonth(year, month)) });
}

/** How many whole calendar months [start, end] spans, or null when it is not a whole-month period. */
export function wholeMonthSpan(start: IsoDate, end: IsoDate): number | null {
  for (let n = 1; n <= MAX_PACKAGE_MONTHS; n++) {
    const e = monthPeriodEnd(start, n);
    if (e === null || e > end) return null;
    if (e === end) return n;
  }
  return null;
}
