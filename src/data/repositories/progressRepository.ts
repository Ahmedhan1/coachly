import { progressEntrySchema, type IsoDate, type ProgressEntry } from '@/domain/models';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

export class ProgressRepository extends EntityRepository<ProgressEntry> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.progress, progressEntrySchema);
  }

  /** A client's entries, oldest first (chart order). */
  async listByClient(clientId: string): Promise<ProgressEntry[]> {
    const rows = await this.table.where('clientId').equals(clientId).filter((p) => p.deletedAt === null).toArray();
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Latest check-in date per client. */
  async lastCheckInByClient(): Promise<Map<string, IsoDate>> {
    const result = new Map<string, IsoDate>();
    for (const row of await this.list()) {
      const current = result.get(row.clientId);
      if (!current || row.date > current) result.set(row.clientId, row.date);
    }
    return result;
  }
}
