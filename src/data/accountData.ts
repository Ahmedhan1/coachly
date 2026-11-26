import type { AppDatabase } from './db';
import { replaceAllData } from './backupIO';
import { ENTITY_TABLES } from './schema';

/**
 * Device-local meta key: the account (user id) the data on this phone belongs to. Never inside a backup
 * (`auth.` prefix), so restoring a file never changes whose phone it is.
 */
export const DATA_OWNER_KEY = 'auth.dataOwner';

/** True when the phone holds the trainer's own data (anything that is not the demo data). */
export async function hasUserData(db: AppDatabase): Promise<boolean> {
  for (const name of ENTITY_TABLES) {
    const own = await db.table<{ demo?: boolean }>(name).filter((r) => r.demo !== true).first();
    if (own !== undefined) return true;
  }
  return false;
}

/**
 * Erases everything another account left on this phone: every table (photos and the upload queue included) and
 * the `backup.*` keys (that account's backup password and status). The signed-in session (`auth.*`) stays.
 */
export async function eraseLocalData(db: AppDatabase): Promise<void> {
  await replaceAllData(db, {});
  const backupKeys = (await db.meta.toCollection().primaryKeys()).map(String).filter((k) => k.startsWith('backup.'));
  await db.meta.bulkDelete(backupKeys);
}
