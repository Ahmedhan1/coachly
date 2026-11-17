import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  endOfMonth,
  fromDayNumber,
  isIsoDate,
  startOfWeek,
  toDayNumber,
  weekdayOf,
} from './localDate';

describe('localDate', () => {
  it('day numbers match the Unix epoch', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017); // 30 years incl. 7 leap days + Jan(31)+Feb(29)
    expect(fromDayNumber(-1)).toBe('1969-12-31');
  });

  it('round-trips every day across leap years', () => {
    for (let n = toDayNumber('1999-12-01'); n < toDayNumber('2001-03-01'); n++) {
      expect(toDayNumber(fromDayNumber(n))).toBe(n);
    }
  });

  it('adds days across month/year and leap boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-16', '2026-12-01')).toBe(15);
  });

  it('weekday: 2026-11-16 is a Monday, 1970-01-01 a Thursday', () => {
    expect(weekdayOf('2026-11-16')).toBe(1);
    expect(weekdayOf('1970-01-01')).toBe(4);
  });

  it('week starts Saturday by default', () => {
    expect(startOfWeek('2026-11-16')).toBe('2026-11-14');
    expect(startOfWeek('2026-11-14')).toBe('2026-11-14');
    expect(startOfWeek('2026-11-16', 1)).toBe('2026-11-16');
  });

  it('validates and finds month end', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(() => toDayNumber('nope')).toThrow(RangeError);
  });
});
