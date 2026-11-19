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

/**
 * What a client owes. With a priced package, the current package costs its price and every payment dated in the
 * package period counts toward it, so recording "paid 300" on a 1,000 package leaves 700 — whether or not a
 * pending row for the price was ever entered. Unpaid rows of the period (a renewal charge, installments) are part
 * of that price, not on top of it; only the part above what the package still needs (an extra) is added. Unpaid
 * rows from before the period are older debt and stay owed. Without a priced, dated package: the unpaid rows.
 */
export function packageBalance(pkg: BalancePackage | null, payments: readonly BalancePayment[]): PackageBalance {
  const dueRows = payments.filter((p) => p.status === 'due');
  if (!pkg || pkg.priceMinor <= 0 || pkg.startDate === null) {
    return { owedMinor: sum(dueRows), paidMinor: 0, priceMinor: 0 };
  }
  const start = pkg.startDate;
  const inPeriod = (p: BalancePayment) => rowDate(p) >= start;
  const paidMinor = sum(payments.filter((p) => p.status === 'paid' && inPeriod(p)));
  const packageLeft = Math.max(0, pkg.priceMinor - paidMinor);
  const dueInPeriod = sum(dueRows.filter(inPeriod));
  const olderDebt = sum(dueRows.filter((p) => !inPeriod(p)));
  return { owedMinor: olderDebt + Math.max(packageLeft, dueInPeriod), paidMinor, priceMinor: pkg.priceMinor };
}
