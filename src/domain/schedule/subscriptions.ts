import { daysBetween, isIsoDate, type IsoDate } from './localDate';

export interface SubscriptionPeriod {
  id: string;
  clientId: string;
  /** Last day the subscription is valid (inclusive). */
  endDate: IsoDate;
}

export interface Expiring<T> {
  subscription: T;
  /** 0 = ends today. */
  daysLeft: number;
}

/**
 * Subscriptions ending within `days` days of `today` (inclusive; already-expired ones excluded),
 * soonest first. `today` comes from `localDateAt(now, clock)`.
 */
export function expiringWithin<T extends SubscriptionPeriod>(subs: readonly T[], today: IsoDate, days: number): Expiring<T>[] {
  return subs
    .filter((s) => isIsoDate(s.endDate))
    .map((s) => ({ subscription: s, daysLeft: daysBetween(today, s.endDate) }))
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.subscription.id.localeCompare(b.subscription.id));
}

/** Subscriptions whose end date is before `today`. */
export function expiredBy<T extends SubscriptionPeriod>(subs: readonly T[], today: IsoDate): T[] {
  return subs.filter((s) => isIsoDate(s.endDate) && s.endDate < today);
}
