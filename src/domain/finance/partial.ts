import { err, ok, type Result } from '../nutrition/result';

export interface Settlement {
  /** Recorded as paid. */
  paidMinor: number;
  /** Still owed after this payment (0 when the charge is covered); kept as a new unpaid charge. */
  remainderMinor: number;
}

/**
 * A client pays `paidMinor` against an unpaid charge of `chargeMinor`. Partial payments split the charge:
 * the paid part and the remainder, which stays due on the same date. Paying more than the charge is
 * allowed (tip, rounding) and leaves nothing owed.
 */
export function settleCharge(chargeMinor: number, paidMinor: number): Result<Settlement, 'invalid_amount'> {
  if (!Number.isSafeInteger(paidMinor) || paidMinor <= 0 || !Number.isSafeInteger(chargeMinor) || chargeMinor < 0) {
    return err('invalid_amount');
  }
  return ok({ paidMinor, remainderMinor: Math.max(0, chargeMinor - paidMinor) });
}

/** What a client still owes: the sum of their unpaid charges. */
export function balanceDue(payments: ReadonlyArray<{ amountMinor: number; status: 'paid' | 'due' }>): number {
  return payments.reduce((sum, p) => (p.status === 'due' ? sum + p.amountMinor : sum), 0);
}
