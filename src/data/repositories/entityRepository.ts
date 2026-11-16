import type { Table } from 'dexie';
import type { z } from 'zod';
import type { EntityMeta } from '@/domain/models';
import type { AppDatabase } from '../db';
import type { Clock, IdFactory } from '../clock';
import type { EntityTableName } from '../schema';

export interface StoredEntity extends EntityMeta {
  id: string;
}

/** What callers pass to create: everything except id and bookkeeping. */
export type NewEntity<T extends StoredEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'demo'> & {
  demo?: boolean;
};
export type EntityPatch<T extends StoredEntity> = Partial<NewEntity<T>>;

export interface RepositoryContext {
  db: AppDatabase;
  clock: Clock;
  newId: IdFactory;
}

export class NotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`${table}/${id} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Generic repository for one soft-deletable entity table.
 * Every write is validated with the entity's zod schema first; invalid data never reaches IndexedDB.
 */
export class EntityRepository<T extends StoredEntity> {
  constructor(
    protected readonly ctx: RepositoryContext,
    protected readonly tableName: EntityTableName,
    protected readonly schema: z.ZodType<T>,
  ) {}

  protected get table(): Table<T, string> {
    return this.ctx.db.table(this.tableName);
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id);
    return row && row.deletedAt === null ? row : undefined;
  }

  async require(id: string): Promise<T> {
    const row = await this.get(id);
    if (!row) throw new NotFoundError(this.tableName, id);
    return row;
  }

  /** All live (not deleted) rows. */
  async list(): Promise<T[]> {
    return this.table.filter((r) => r.deletedAt === null).toArray();
  }

  async create(input: NewEntity<T>): Promise<T> {
    const now = this.ctx.clock();
    const entity = this.schema.parse({
      ...input,
      id: this.ctx.newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      demo: input.demo ?? false,
    });
    await this.table.add(entity);
    return entity;
  }

  async update(id: string, patch: EntityPatch<T>): Promise<T> {
    return this.ctx.db.transaction('rw', this.table, async () => {
      const existing = await this.require(id);
      const next = this.schema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        deletedAt: null,
        updatedAt: this.ctx.clock(),
      });
      await this.table.put(next);
      return next;
    });
  }

  /** Marks the row deleted and records it so "undo last delete" can bring it back. */
  async softDelete(id: string): Promise<void> {
    const { db } = this.ctx;
    await db.transaction('rw', this.table, db.deletions, async () => {
      const row = await this.require(id);
      const at = this.ctx.clock();
      await this.table.put({ ...row, deletedAt: at, updatedAt: at });
      await db.deletions.add({ table: this.tableName, entityId: id, at });
    });
  }

  /** Brings a soft-deleted row back. No-op if it is already live. */
  async restore(id: string): Promise<void> {
    const { db } = this.ctx;
    await db.transaction('rw', this.table, db.deletions, async () => {
      const row = await this.table.get(id);
      if (!row) throw new NotFoundError(this.tableName, id);
      if (row.deletedAt !== null) {
        await this.table.put({ ...row, deletedAt: null, updatedAt: this.ctx.clock() });
      }
      await db.deletions.where('entityId').equals(id).delete();
    });
  }

  /** Permanently removes rows soft-deleted before `before` (epoch ms). Returns how many. */
  async purgeDeleted(before: number): Promise<number> {
    const { db } = this.ctx;
    return db.transaction('rw', this.table, db.deletions, async () => {
      const ids = (await this.table.filter((r) => r.deletedAt !== null && r.deletedAt < before).primaryKeys()) as string[];
      await this.table.bulkDelete(ids);
      await db.deletions.where('entityId').anyOf(ids).delete();
      return ids.length;
    });
  }
}
