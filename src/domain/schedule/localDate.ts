/**
 * Calendar dates as `YYYY-MM-DD` strings (sortable, storable, no time zone attached).
 *
 * All arithmetic converts to a day number (days since 1970-01-01 in the proleptic Gregorian
 * calendar, Howard Hinnant's days_from_civil) and back. No `Date` object is involved, so the
 * result never depends on the device's time zone or on DST.
 */
export type IsoDate = string;

/** 0 = Sunday … 6 = Saturday (same as JS getDay and RFC 5545 SU..SA order). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseIsoDate(s: string): Ymd | null {
  const m = ISO_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isIsoDate(s: string): boolean {
  return parseIsoDate(s) !== null;
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export function formatIsoDate({ year, month, day }: Ymd): IsoDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function ymdToDayNumber({ year, month, day }: Ymd): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function dayNumberToYmd(n: number): Ymd {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Day number of a valid ISO date. Throws on malformed input: callers validate at the boundary. */
export function toDayNumber(d: IsoDate): number {
  const ymd = parseIsoDate(d);
  if (!ymd) throw new RangeError(`invalid ISO date: ${d}`);
  return ymdToDayNumber(ymd);
}

export function fromDayNumber(n: number): IsoDate {
  return formatIsoDate(dayNumberToYmd(n));
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + days);
}

/** b − a in whole days. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function weekdayOf(d: IsoDate): Weekday {
  // 1970-01-01 was a Thursday (4).
  return ((((toDayNumber(d) + 4) % 7) + 7) % 7) as Weekday;
}

/** First day of the week containing `d`. Default week start is Saturday (Egypt). */
export const DEFAULT_WEEK_START: Weekday = 6;

export function startOfWeek(d: IsoDate, weekStart: Weekday = DEFAULT_WEEK_START): IsoDate {
  return addDays(d, -((weekdayOf(d) - weekStart + 7) % 7));
}

export function startOfMonth(d: IsoDate): IsoDate {
  return `${d.slice(0, 8)}01`;
}

export function endOfMonth(d: IsoDate): IsoDate {
  const ymd = parseIsoDate(d);
  if (!ymd) throw new RangeError(`invalid ISO date: ${d}`);
  return formatIsoDate({ ...ymd, day: daysInMonth(ymd.year, ymd.month) });
}
