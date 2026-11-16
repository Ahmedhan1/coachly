import { clientSchema, type Client } from '@/domain/models';
import { searchItems } from '../search';
import { TABLES } from '../schema';
import { EntityRepository, type RepositoryContext } from './entityRepository';

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
}
