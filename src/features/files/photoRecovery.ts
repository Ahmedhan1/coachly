import type { AppServices } from '@/app/services';
import { recoverPhotos } from './recoverPhotos';

/**
 * Device-local flag (`backup.` prefix: never in a backup, kept by a restore): set just before the reload that
 * follows a cloud restore, so the next start brings the full-size photos back from the bucket.
 */
export const PHOTOS_TO_RECOVER_KEY = 'backup.recoverPhotos';

/** Runs the photo recovery once after a restore. Keeps the flag while offline, so it retries later. */
export async function recoverPhotosIfPending(services: Pick<AppServices, 'data' | 'images' | 'online' | 'meta'>): Promise<number> {
  if ((await services.meta.get(PHOTOS_TO_RECOVER_KEY)) !== true) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const n = await recoverPhotos(services);
  // A list call that failed returns 0 too; the flag is cleared only when the server answered (see remoteFiles).
  if ((await services.online?.files?.remoteFiles('client_photo')) !== null) await services.meta.set(PHOTOS_TO_RECOVER_KEY, null);
  return n;
}
