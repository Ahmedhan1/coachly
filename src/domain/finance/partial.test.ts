import { describe, expect, it } from 'vitest';
import { balanceDue, settleCharge } from './partial';

describe('settleCharge', () => {
  it('pays the whole charge when the amount covers it', () => {
    expect(settleCharge(300_000, 300_000)).toEqual({ ok: true, value: { paidMinor: 300_000, remainderMinor: 0 } });
    expect(settleCharge(300_000, 350_000)).toEqual({ ok: true, value: { paidMinor: 350_000, remainderMinor: 0 } });
  });

  it('splits a partial payment into paid + what is still owed', () => {
    expect(settleCharge(300_000, 100_000)).toEqual({ ok: true, value: { paidMinor: 100_000, remainderMinor: 200_000 } });
  });

  it('rejects zero, negative or fractional amounts', () => {
    expect(settleCharge(300_000, 0).ok).toBe(false);
    expect(settleCharge(300_000, -5).ok).toBe(false);
    expect(settleCharge(300_000, 1.5).ok).toBe(false);
  });
});

describe('balanceDue', () => {
  it('sums the unpaid charges of a client', () => {
    expect(
      balanceDue([
        { amountMinor: 100_000, status: 'due' },
        { amountMinor: 50_000, status: 'paid' },
        { amountMinor: 25_000, status: 'due' },
      ]),
    ).toBe(125_000);
    expect(balanceDue([])).toBe(0);
  });
});
