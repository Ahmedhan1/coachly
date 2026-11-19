import { json } from '../http';
import type { CloudDeps } from '../ports';

/** Total bytes stored in R2 by this Worker (backups + client pages + check-ins), kept in one D1 row. */
export async function storedBytes(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT bytes FROM storage_usage WHERE id = 1').first<{ bytes: number }>();
  return row?.bytes ?? 0;
}

/** Statement that moves the running total by `delta` bytes; run it in the same batch as the index change. */
export function adjustUsage(db: D1Database, delta: number): D1PreparedStatement {
  return db.prepare('UPDATE storage_usage SET bytes = MAX(0, bytes + ?) WHERE id = 1').bind(delta);
}

/**
 * Global guard (docs/LIMITS.md, "Policy when R2 fills"): once the total would pass `storageGuardBytes`, an upload is
 * refused only when it would make this trainer's footprint bigger (`newSize > replacedSize`). Re-uploading a
 * backup of the same or smaller size always works, so nobody loses their only cloud copy.
 */
export async function wouldOverfill(cloud: CloudDeps, newSize: number, replacedSize: number): Promise<boolean> {
  const growth = newSize - replacedSize;
  if (growth <= 0) return false;
  return (await storedBytes(cloud.db)) + growth > cloud.config.storageGuardBytes;
}

export function storageFull(): Response {
  return json({ error: 'storage_full' }, 507);
}
