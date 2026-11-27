import { describe, expect, it } from 'vitest';
import { packageBalance, type BalancePayment } from './packageBalance';

const paid = (amountMinor: number, paidOn: string, dueOn: string | null = null): BalancePayment => ({ amountMinor, status: 'paid', paidOn, dueOn });
const due = (amountMinor: number, dueOn: string): BalancePayment => ({ amountMinor, status: 'due', paidOn: null, dueOn });
const pkg = { priceMinor: 100_000, startDate: '2026-11-19' };

describe('packageBalance', () => {
  it('package price minus what was paid in the package period (the reported bug: 1000, paid 300, 150 due → 700)', () => {
    const b = packageBalance(pkg, [paid(30_000, '2026-11-19'), due(15_000, '2026-11-19')]);
    expect(b).toEqual({ owedMinor: 70_000, paidMinor: 30_000, priceMinor: 100_000 });
  });

  it('a new package with nothing paid owes its full price', () => {
    expect(packageBalance(pkg, []).owedMinor).toBe(100_000);
  });

  it('a fully paid package owes nothing; paying more never goes negative', () => {
    expect(packageBalance(pkg, [paid(60_000, '2026-11-19'), paid(50_000, '2026-11-25')]).owedMinor).toBe(0);
  });

  it('the renewal charge is the package price, not on top of it', () => {
    expect(packageBalance(pkg, [due(100_000, '2026-11-19')]).owedMinor).toBe(100_000);
  });

  it('a partly settled renewal charge (split into paid + due remainder) owes the remainder once', () => {
    expect(packageBalance(pkg, [paid(30_000, '2026-11-20', '2026-11-19'), due(70_000, '2026-11-19')]).owedMinor).toBe(70_000);
  });

  it('unpaid rows above what the package still needs (extras) are still owed', () => {
    expect(packageBalance(pkg, [paid(100_000, '2026-11-19'), due(20_000, '2026-11-22')]).owedMinor).toBe(20_000);
  });

  it('the reported bug: 4,000 package paid, an extra 330 due and 300 paid later in the period → 30 still owed, package paid at most its price', () => {
    const start = { priceMinor: 400_000, startDate: '2026-10-18' };
    const b = packageBalance(start, [paid(400_000, '2026-10-18'), due(33_000, '2026-11-27'), paid(30_000, '2026-11-27')]);
    expect(b).toEqual({ owedMinor: 3_000, paidMinor: 400_000, priceMinor: 400_000 });
  });

  it('paying an extra in full leaves nothing owed', () => {
    expect(packageBalance(pkg, [paid(100_000, '2026-11-19'), paid(20_000, '2026-11-22', '2026-11-22')]).owedMinor).toBe(0);
  });

  it('a partly settled extra (paid part + due remainder) owes the remainder', () => {
    const rows = [paid(100_000, '2026-11-19'), paid(10_000, '2026-11-23', '2026-11-22'), due(10_000, '2026-11-22')];
    expect(packageBalance(pkg, rows).owedMinor).toBe(10_000);
  });

  it('a settled renewal charge pays the package; a later payment counts toward an extra', () => {
    const rows = [paid(100_000, '2026-11-19', '2026-11-19'), due(20_000, '2026-11-22'), paid(25_000, '2026-11-24')];
    expect(packageBalance(pkg, rows)).toEqual({ owedMinor: 0, paidMinor: 100_000, priceMinor: 100_000 });
  });

  it('debt from before the package started stays owed on top', () => {
    const b = packageBalance(pkg, [due(25_000, '2026-10-19'), paid(100_000, '2026-11-19')]);
    expect(b.owedMinor).toBe(25_000);
  });

  it('paying an old charge late counts for that old charge, not for the current package', () => {
    const b = packageBalance(pkg, [paid(25_000, '2026-11-21', '2026-10-19')]);
    expect(b).toEqual({ owedMinor: 100_000, paidMinor: 0, priceMinor: 100_000 });
  });

  it('without a priced package or a start date it is the sum of unpaid rows (as before)', () => {
    const rows = [paid(30_000, '2026-11-19'), due(15_000, '2026-11-19')];
    expect(packageBalance(null, rows)).toEqual({ owedMinor: 15_000, paidMinor: 0, priceMinor: 0 });
    expect(packageBalance({ priceMinor: 0, startDate: '2026-11-19' }, rows).owedMinor).toBe(15_000);
    expect(packageBalance({ priceMinor: 100_000, startDate: null }, rows).owedMinor).toBe(15_000);
  });
});
