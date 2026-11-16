import { paymentSchema, type Payment } from '@/domain/models';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

export class PaymentRepository extends EntityRepository<Payment> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.payments, paymentSchema);
  }

  /** A client's payments, newest first. */
  async listByClient(clientId: string): Promise<Payment[]> {
    const rows = await this.table.where('clientId').equals(clientId).filter((p) => p.deletedAt === null).toArray();
    const key = (p: Payment) => p.paidOn ?? p.dueOn ?? '';
    return rows.sort((a, b) => key(b).localeCompare(key(a)));
  }
}
