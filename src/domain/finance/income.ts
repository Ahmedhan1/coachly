import { err, ok, type Result } from '../nutrition/result';
import { endOfMonth, isIsoDate, startOfMonth, type IsoDate } from '../schedule/localDate';
import { expiringWithin, type Expiring, type SubscriptionPeriod } from '../schedule/subscriptions';

/**
 * Money is always an integer number of minor units (piastres for EGP): no floating-point sums.
 *
 * A payment record is one charge: what is owed (`amountMinor`), when (`dueDate`) and when it was paid
 * (`paidOn`, null while unpaid). A partial payment is recorded by splitting the charge in two records.
 */
export interface PaymentRecord {
  id: string;
  clientId: string;
  subscriptionId?: string | null;
  amountMinor: number;
  dueDate: IsoDate;
  paidOn: IsoDate | null;
}

export interface PricedSubscription extends SubscriptionPeriod {
  /** Price of renewing this subscription. */
  priceMinor: number;
}

export interface IncomeInput {
  payments: readonly PaymentRecord[];
  subscriptions: readonly PricedSubscription[];
  /** Local date of "now" (see schedule/zone `localDateAt`). Its month is the dashboard month. */
  today: IsoDate;
  /** Horizon for the "renews soon" list. */
  renewWithinDays?: number;
}

export const DEFAULT_RENEW_WITHIN_DAYS = 7;

export interface IncomeDashboard {
  monthStart: IsoDate;
  monthEnd: IsoDate;
  /** Paid during this month (by `paidOn`), whatever the due date. */
  paidThisMonthMinor: number;
  /** Unpaid with a due date before today (any month), oldest first. */
  overdue: PaymentRecord[];
  overdueMinor: number;
  /** Unpaid with a due date from today to the end of the month. */
  dueRestOfMonthMinor: number;
  /**
   * Subscriptions ending between today and month end whose next charge is not recorded yet
   * (no payment record of that client due on/after the end date).
   */
  expectedRenewals: PricedSubscription[];
  expectedRenewalsMinor: number;
  /** paidThisMonth + every unpaid charge due this month (incl. overdue ones from this month) + expected renewals. */
  expectedThisMonthMinor: number;
  /** Soonest-ending subscriptions within `renewWithinDays`. */
  renewingSoon: Expiring<PricedSubscription>[];
}

export type IncomeError = 'invalid_amount' | 'invalid_date';

const validAmount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

class UnsafeTotal extends Error {}
/** Sum that refuses to lose precision (money is integer minor units). */
const safeSum = (xs: readonly number[]): number => {
  const total = sum(xs);
  if (!Number.isSafeInteger(total)) throw new UnsafeTotal();
  return total;
};

function validate(input: IncomeInput): IncomeError | null {
  if (!isIsoDate(input.today)) return 'invalid_date';
  for (const p of input.payments) {
    if (!validAmount(p.amountMinor)) return 'invalid_amount';
    if (!isIsoDate(p.dueDate) || (p.paidOn !== null && !isIsoDate(p.paidOn))) return 'invalid_date';
  }
  for (const s of input.subscriptions) {
    if (!validAmount(s.priceMinor)) return 'invalid_amount';
    if (!isIsoDate(s.endDate)) return 'invalid_date';
  }
  return null;
}

export function incomeDashboard(input: IncomeInput): Result<IncomeDashboard, IncomeError> {
  const invalid = validate(input);
  if (invalid) return err(invalid);
  try {
    return ok(compute(input));
  } catch (e) {
    if (e instanceof UnsafeTotal) return err('invalid_amount');
    throw e;
  }
}

function compute(input: IncomeInput): IncomeDashboard {
  const { payments, subscriptions, today } = input;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const inMonth = (d: IsoDate): boolean => d >= monthStart && d <= monthEnd;

  const paidThisMonthMinor = safeSum(payments.filter((p) => p.paidOn !== null && inMonth(p.paidOn)).map((p) => p.amountMinor));
  const unpaid = payments.filter((p) => p.paidOn === null);
  const overdue = unpaid.filter((p) => p.dueDate < today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const dueRestOfMonthMinor = safeSum(unpaid.filter((p) => p.dueDate >= today && p.dueDate <= monthEnd).map((p) => p.amountMinor));
  const unpaidDueThisMonthMinor = safeSum(unpaid.filter((p) => inMonth(p.dueDate)).map((p) => p.amountMinor));

  // Latest due date per client, so each subscription is checked in O(1) instead of scanning every payment.
  const latestDue = new Map<string, IsoDate>();
  for (const p of payments) {
    const prev = latestDue.get(p.clientId);
    if (prev === undefined || p.dueDate > prev) latestDue.set(p.clientId, p.dueDate);
  }
  const expectedRenewals = subscriptions.filter((s) => {
    const last = latestDue.get(s.clientId);
    return s.endDate >= today && s.endDate <= monthEnd && !(last !== undefined && last >= s.endDate);
  });
  const expectedRenewalsMinor = safeSum(expectedRenewals.map((s) => s.priceMinor));
  const overdueMinor = safeSum(overdue.map((p) => p.amountMinor));

  return {
    monthStart,
    monthEnd,
    paidThisMonthMinor,
    overdue,
    overdueMinor,
    dueRestOfMonthMinor,
    expectedRenewals,
    expectedRenewalsMinor,
    expectedThisMonthMinor: safeSum([paidThisMonthMinor, unpaidDueThisMonthMinor, expectedRenewalsMinor]),
    renewingSoon: expiringWithin(subscriptions, today, input.renewWithinDays ?? DEFAULT_RENEW_WITHIN_DAYS),
  };
}
