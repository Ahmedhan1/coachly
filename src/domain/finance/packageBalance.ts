export interface BalancePayment {
  amountMinor: number;
  status: 'paid' | 'due';
  paidOn: string | null;
  dueOn: string | null;
}

export interface BalancePackage {
  priceMinor: number;
  /** First day of the current package period (ISO date); null when the package has no dates. */
  startDate: string | null;
}

export interface PackageBalance {
  /** What the client still owes in total. */
  owedMinor: number;
  /** Paid toward the current package (0 without a priced, dated package). */
  paidMinor: number;
  /** Price of the current package (0 without one). */
  priceMinor: number;
}

/** A row belongs to the period of the charge it settles: its due date when it had one, else the day it was paid. */
function rowDate(p: BalancePayment): string {
  return p.dueOn ?? p.paidOn ?? '';
}

const sum = (rows: readonly BalancePayment[]) => rows.reduce((n, p) => n + p.amountMinor, 0);

/** A recorded charge: still unpaid, or the paid part of one (a settled row keeps its due date). */
const isCharge = (p: BalancePayment) => p.status === 'due' || p.dueOn !== null;

/**
 * What a client owes, as a ledger of the current package period: charges (the package price plus any extras)
 * minus everything paid in the period, plus unpaid rows from before the period (older debt).
 *
 * Which recorded charges are the package itself and which are extras (supplements, an extra session):
 * charges due on the package's first day (the renewal charge) are the package price, up to it; free payments
 * (not settling a recorded charge) then pay the rest of the package; later charges fill what the package still
 * lacks (installments) and anything beyond that is an extra on top. So "paid 300" on a 1,000 package leaves 700
 * whether or not a pending row for the price was entered, and a 330 extra after a fully paid package with 300
 * paid toward it leaves 30. Without a priced, dated package: the unpaid rows.
 *
 * `paidMinor` is what went toward the package price (never above it); the package is paid in full when it
 * equals `priceMinor`, and then everything in `owedMinor` is for other charges.
 */
export function packageBalance(pkg: BalancePackage | null, payments: readonly BalancePayment[]): PackageBalance {
  const dueRows = payments.filter((p) => p.status === 'due');
  if (!pkg || pkg.priceMinor <= 0 || pkg.startDate === null) {
    return { owedMinor: sum(dueRows), paidMinor: 0, priceMinor: 0 };
  }
  const start = pkg.startDate;
  const price = pkg.priceMinor;
  const period = payments.filter((p) => rowDate(p) >= start);
  const olderDebt = sum(dueRows.filter((p) => rowDate(p) < start));
  const charges = period.filter(isCharge);
  const paidInPeriod = sum(period.filter((p) => p.status === 'paid'));
  const freePaid = sum(period.filter((p) => p.status === 'paid' && p.dueOn === null));

  const firstDay = sum(charges.filter((p) => rowDate(p) === start));
  const later = sum(charges.filter((p) => rowDate(p) > start));
  const fromFirstDay = Math.min(price, firstDay);
  const lacking = Math.max(0, price - fromFirstDay - freePaid);
  const extras = firstDay - fromFirstDay + later - Math.min(later, lacking);

  const owedInPeriod = Math.max(0, price + extras - paidInPeriod);
  return { owedMinor: olderDebt + owedInPeriod, paidMinor: Math.min(price, paidInPeriod), priceMinor: price };
}
