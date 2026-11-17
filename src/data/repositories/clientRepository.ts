import { clientSchema, type Client } from '@/domain/models';
import { cascadeDelete, cascadeRestore, cascadeTables } from '../clientCascade';
import { searchItems } from '../search';
import { TABLES } from '../schema';
import { EntityRepository, NotFoundError, type RepositoryContext } from './entityRepository';

const collator = new Intl.Collator('ar');

export class ClientRepository extends EntityRepository<Client> {
  constructor(ctx: RepositoryContext) {
    super(ctx, TABLES.clients, clientSchema);
  }

  /** Live clients sorted by name (Arabic collation). */
  override async list(): Promise<Client[]> {
    const rows = await super.list();
    return rows.sort((a, b) => collator.compare(a.name, b.name));
  }

  async search(query: string): Promise<Client[]> {
    return searchItems(await this.list(), query, (c) => [c.name, c.phone, c.goalNote, c.notes]);
  }

  /** Deletes the client and, in the same transaction, the rows that belong to it (see clientCascade). */
  override async softDelete(id: string): Promise<void> {
    const { db } = this.ctx;
    await db.transaction('rw', [this.table, db.deletions, ...cascadeTables(db)], async () => {
      const row = await this.require(id);
      const at = this.ctx.clock();
      await this.table.put({ ...row, deletedAt: at, updatedAt: at });
      await cascadeDelete(db, id, at);
      await db.deletions.add({ table: this.tableName, entityId: id, at });
    });
  }

  override async restore(id: string): Promise<void> {
    const { db } = this.ctx;
    await db.transaction('rw', [this.table, db.deletions, ...cascadeTables(db)], async () => {
      const row = await this.table.get(id);
      if (!row) throw new NotFoundError(this.tableName, id);
      if (row.deletedAt !== null) {
        const now = this.ctx.clock();
        await cascadeRestore(db, id, row.deletedAt, now);
        await this.table.put({ ...row, deletedAt: null, updatedAt: now });
      }
      await db.deletions.where('entityId').equals(id).delete();
    });
  }
}
