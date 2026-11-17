import { daysInMonth, parseIsoDate, type IsoDate } from '../schedule';

/**
 * True when `today` is the client's birthday. A Feb 29 birthday is celebrated on Feb 28 in common years,
 * so leap-day clients still get their message every year.
 */
export function isBirthdayOn(birthDate: string, today: IsoDate): boolean {
  const b = parseIsoDate(birthDate);
  const t = parseIsoDate(today);
  if (!b || !t) return false;
  if (b.month === t.month && b.day === t.day) return true;
  return b.month === 2 && b.day === 29 && t.month === 2 && t.day === 28 && daysInMonth(t.year, 2) === 28;
}
