import { incomeDashboard, type IncomeDashboard, type PaymentRecord, type PricedSubscription } from '@/domain/finance';
import type { Client, Payment } from '@/domain/models';
import { endOfMonth, type IsoDate } from '@/domain/schedule';

/** Maps stored payments and client packages onto the income domain's input shapes. */
export function toPaymentRecords(payments: readonly Payment[]): PaymentRecord[] {
  return payments.flatMap((p) => {
    const due = p.dueOn ?? p.paidOn;
    if (!due) return [];
    return [{ id: p.id, clientId: p.clientId, amountMinor: p.amountMinor, dueDate: due, paidOn: (p.status === 'paid' ? p.paidOn : null) }];
  });
}

export function toSubscriptions(clients: readonly Client[]): PricedSubscription[] {
  return clients.flatMap((c) =>
    c.package && c.endDate ? [{ id: c.id, clientId: c.id, endDate: c.endDate, priceMinor: c.package.priceMinor }] : [],
  );
}

export function buildIncome(clients: readonly Client[], payments: readonly Payment[], today: IsoDate): IncomeDashboard | null {
  const r = incomeDashboard({ payments: toPaymentRecords(payments), subscriptions: toSubscriptions(clients), today });
  return r.ok ? r.value : null;
}

/**
 * The "today" the dashboard is computed for when the trainer browses months: today itself for this month,
 * the last day of a past month (what was paid in it, what was still owed at its end), the first day of a
 * future month (what is expected in it).
 */
export function monthRef(today: IsoDate, offset: number): IsoDate {
  if (offset === 0) return today;
  const [y, m] = today.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + offset;
  const first = `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
  return offset < 0 ? endOfMonth(first) : first;
}
