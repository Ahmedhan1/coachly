import type { AppDatabase } from '@/data/db';
import { TABLES } from '@/data/schema';

/**
 * Calls `onChange` (outside the write transaction) whenever any table except `meta` is written.
 * `meta` is excluded because account and backup bookkeeping live there and would re-trigger backups.
 * Returns a function that removes the hooks.
 */
export function watchDataChanges(db: AppDatabase, onChange: () => void): () => void {
  let queued = false;
  const fire = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      try {
        onChange();
      } catch {
        // never break a database write because of a listener
      }
    });
  };
  const removers: (() => void)[] = [];
  for (const table of db.tables) {
    if (table.name === TABLES.meta) continue;
    const creating = () => fire();
    const updating = () => fire();
    const deleting = () => fire();
    table.hook('creating', creating);
    table.hook('updating', updating);
    table.hook('deleting', deleting);
    removers.push(() => {
      table.hook('creating').unsubscribe(creating);
      table.hook('updating').unsubscribe(updating);
      table.hook('deleting').unsubscribe(deleting);
    });
  }
  return () => removers.forEach((r) => r());
}
