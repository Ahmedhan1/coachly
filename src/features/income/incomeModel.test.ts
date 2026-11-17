import { describe, expect, it } from 'vitest';
import type { Client, Payment } from '@/domain/models';
import { buildIncome, monthRef } from './incomeModel';

describe('monthRef', () => {
  it('is today for the current month, the last day of a past month, the first day of a future one', () => {
    expect(monthRef('2026-11-17', 0)).toBe('2026-11-17');
    expect(monthRef('2026-11-17', -1)).toBe('2026-10-31');
    expect(monthRef('2026-03-30', -1)).toBe('2026-02-28');
    expect(monthRef('2026-11-17', 2)).toBe('2027-01-01');
    expect(monthRef('2026-01-10', -13)).toBe('2024-12-31');
  });
});

describe('buildIncome', () => {
  const pay = (p: Omit<Partial<Payment>, 'id'> & { id?: string }): Payment =>
    ({ id: 'p', clientId: 'c', amountMinor: 100_000, currency: 'EGP', method: 'cash', status: 'paid', paidOn: '2026-11-02', dueOn: null, note: '', createdAt: 0, updatedAt: 0, deletedAt: null, ...p }) as Payment;
  it('a past month shows what was paid in that month', () => {
    const payments = [pay({ id: 'a', paidOn: '2026-10-05' }), pay({ id: 'b', paidOn: '2026-11-02', amountMinor: 50_000 })];
    expect(buildIncome([] as Client[], payments, monthRef('2026-11-17', -1))?.paidThisMonthMinor).toBe(100_000);
    expect(buildIncome([] as Client[], payments, '2026-11-17')?.paidThisMonthMinor).toBe(50_000);
  });
  it('a partial payment: the paid half counts as paid, the rest stays overdue', () => {
    const payments = [pay({ id: 'a', amountMinor: 150_000, paidOn: '2026-11-03', dueOn: '2026-11-01' }), pay({ id: 'b', amountMinor: 150_000, status: 'due', paidOn: null, dueOn: '2026-11-01' })];
    const d = buildIncome([] as Client[], payments, '2026-11-17');
    expect(d?.paidThisMonthMinor).toBe(150_000);
    expect(d?.overdueMinor).toBe(150_000);
    expect(d?.expectedThisMonthMinor).toBe(300_000);
  });
});
