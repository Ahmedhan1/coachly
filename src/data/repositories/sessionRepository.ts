import { sessionSchema, type Session } from '@/domain/models';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

export class SessionRepository extends EntityRepository<Session> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.sessions, sessionSchema);
  }

  /** Sessions starting in [start, end), ordered by start time. */
  async listBetween(start: number, end: number): Promise<Session[]> {
    return this.table
      .where('startsAt')
      .between(start, end, true, false)
      .filter((s) => s.deletedAt === null)
      .sortBy('startsAt');
  }

  /** A client's sessions in time order, straight from the [clientId+startsAt] index (no in-memory sort). */
  async listByClient(clientId: string): Promise<Session[]> {
    return this.table
      .where('[clientId+startsAt]')
      .between([clientId, -Infinity], [clientId, Infinity])
      .filter((s) => s.deletedAt === null)
      .toArray();
  }
}
