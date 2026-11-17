import { paymentSchema, type IsoDate, type Payment } from '@/domain/models';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

const live = (p: Payment) => p.deletedAt === null;

export class PaymentRepository extends EntityRepository<Payment> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.payments, paymentSchema);
  }

  /** A client's payments, newest first. */
  async listByClient(clientId: string): Promise<Payment[]> {
    const rows = await this.table.where('clientId').equals(clientId).filter(live).toArray();
    const key = (p: Payment) => p.paidOn ?? p.dueOn ?? '';
    return rows.sort((a, b) => key(b).localeCompare(key(a)));
  }

  /** Live unpaid charges (status index: a handful of rows, not years of history). */
  async listDue(): Promise<Payment[]> {
    return this.table.where('status').equals('due').filter(live).toArray();
  }

  /**
   * The payments the income dashboard for `today`'s month can use, read by index instead of the whole history:
   * unpaid charges, payments paid on/after the 1st of the month, and charges due from today on (which mark a
   * renewal as already recorded).
   */
  async listForIncome(today: IsoDate): Promise<Payment[]> {
    const monthStart = `${today.slice(0, 8)}01`;
    const [due, paidRecently, dueAhead] = await Promise.all([
      this.listDue(),
      this.table.where('paidOn').aboveOrEqual(monthStart).filter(live).toArray(),
      this.table.where('dueOn').aboveOrEqual(today).filter(live).toArray(),
    ]);
    const byId = new Map<string, Payment>();
    for (const p of [...due, ...paidRecently, ...dueAhead]) byId.set(p.id, p);
    return [...byId.values()];
  }

  async hasAny(): Promise<boolean> {
    return (await this.table.filter(live).first()) !== undefined;
  }
}
