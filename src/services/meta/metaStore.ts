import type { AppDatabase } from '@/data';

/** Small async key/value store for app flags and device-local values. Production: the Dexie `meta` table. */
export interface MetaStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export function dexieMetaStore(db: AppDatabase): MetaStore {
  return {
    get: async (key) => (await db.meta.get(key))?.value,
    set: async (key, value) => {
      await db.meta.put({ key, value });
    },
  };
}

export function memoryMetaStore(initial: Record<string, unknown> = {}): MetaStore & { dump(): Record<string, unknown> } {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    dump: () => Object.fromEntries(map),
  };
}
