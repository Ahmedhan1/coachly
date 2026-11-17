import { planRenewal, type RenewalPlan } from '@/domain/attendance';
import type { IsoDate, Payment } from '@/domain/models';
import type { AppDatabase } from './db';
import type { Repositories } from './repositories';

export interface RenewPackageResult {
  plan: RenewalPlan;
  /** The client's package fields before renewing (what undo puts back). */
  before: { startDate: IsoDate | null; endDate: IsoDate | null; remainingSessions: number };
  /** The pending charge recorded, or null when the package has no price. */
  payment: Payment | null;
}

/**
 * "جدّد" in one transaction: moves the client's package dates/sessions forward (domain planRenewal) and
 * records the price as a pending payment, both or neither. Returns null when the client has no package
 * with sessions to renew. `today` is the local date of "now".
 */
export async function renewPackage(db: AppDatabase, repos: Repositories, clientId: string, today: IsoDate): Promise<RenewPackageResult | null> {
  return db.transaction('rw', db.clients, db.payments, async () => {
    const client = await repos.clients.require(clientId);
    const pkg = client.package;
    if (!pkg || pkg.totalSessions <= 0) return null;
    const plan = planRenewal(
      { totalSessions: pkg.totalSessions, priceMinor: pkg.priceMinor, startDate: client.startDate, endDate: client.endDate, remainingSessions: client.remainingSessions },
      today,
    );
    const before = { startDate: client.startDate, endDate: client.endDate, remainingSessions: client.remainingSessions };
    await repos.clients.update(clientId, { startDate: plan.startDate, endDate: plan.endDate, remainingSessions: plan.remainingSessions });
    const lastMethod = (await repos.payments.listByClient(clientId))[0]?.method ?? 'cash';
    const payment = plan.charge
      ? await repos.payments.create({
          clientId: client.id,
          amountMinor: plan.charge.amountMinor,
          currency: pkg.currency,
          status: 'due',
          paidOn: null,
          dueOn: plan.charge.dueOn,
          method: lastMethod,
          note: '',
        })
      : null;
    return { plan, before, payment };
  });
}

/** Undo of `renewPackage` (toast action), also in one transaction. */
export async function undoRenewal(db: AppDatabase, repos: Repositories, clientId: string, result: RenewPackageResult): Promise<void> {
  await db.transaction('rw', db.clients, db.payments, db.deletions, async () => {
    await repos.clients.update(clientId, result.before);
    if (result.payment && (await repos.payments.get(result.payment.id))) await repos.payments.softDelete(result.payment.id);
  });
}
