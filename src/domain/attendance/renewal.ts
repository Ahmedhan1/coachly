import { addDays, daysBetween, isIsoDate, type IsoDate } from '../schedule/localDate';
import { monthPeriodEnd, wholeMonthSpan } from './months';

export interface PackageSnapshot {
  totalSessions: number;
  priceMinor: number;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remainingSessions: number;
}

export interface RenewalPlan {
  startDate: IsoDate;
  endDate: IsoDate;
  remainingSessions: number;
  /** Unused sessions carried over (only when renewing before the old package ended). */
  carriedOver: number;
  /** The pending charge to record (null when the package has no price). */
  charge: { amountMinor: number; dueOn: IsoDate } | null;
}

export const DEFAULT_PACKAGE_DAYS = 30;
/** Storage limit of `Client.remainingSessions` (clientSchema): a plan above it could never be saved. */
export const MAX_REMAINING_SESSIONS = 1000;

/**
 * "جدّد": copies the last package forward. Same size, price and length; it starts the day after the old
 * one ends, or today when that is already past. A whole-calendar-month period (Jan 1–31, Jan 15–Feb 14)
 * renews by the same number of calendar months, so monthly clients never drift; any other period keeps
 * its length in days. Sessions left from a package that has not ended yet carry
 * over. The price is recorded as a pending payment due on the new start date.
 */
export function planRenewal(pkg: PackageSnapshot, today: IsoDate, defaultDays = DEFAULT_PACKAGE_DAYS): RenewalPlan {
  const hasPeriod = pkg.startDate !== null && pkg.endDate !== null && isIsoDate(pkg.startDate) && isIsoDate(pkg.endDate);
  const lengthDays = hasPeriod ? Math.max(1, daysBetween(pkg.startDate as IsoDate, pkg.endDate as IsoDate)) : defaultDays;
  const stillRunning = pkg.endDate !== null && isIsoDate(pkg.endDate) && pkg.endDate >= today;
  const startDate = stillRunning ? addDays(pkg.endDate as IsoDate, 1) : today;
  const total = Math.min(MAX_REMAINING_SESSIONS, Math.max(0, Math.floor(pkg.totalSessions)));
  const leftover = stillRunning ? Math.max(0, Math.floor(pkg.remainingSessions)) : 0;
  const carriedOver = Math.min(leftover, MAX_REMAINING_SESSIONS - total);
  const months = hasPeriod ? wholeMonthSpan(pkg.startDate as IsoDate, pkg.endDate as IsoDate) : null;
  const endDate = (months !== null ? monthPeriodEnd(startDate, months) : null) ?? addDays(startDate, lengthDays);
  return {
    startDate,
    endDate,
    remainingSessions: total + carriedOver,
    carriedOver,
    charge: pkg.priceMinor > 0 ? { amountMinor: pkg.priceMinor, dueOn: startDate } : null,
  };
}
