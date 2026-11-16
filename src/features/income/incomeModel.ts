import { incomeDashboard, type IncomeDashboard, type PaymentRecord, type PricedSubscription } from '@/domain/finance';
import type { Client, Payment } from '@/domain/models';
import type { IsoDate } from '@/domain/schedule';

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
