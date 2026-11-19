import type { AppServices } from '@/app/services';
import type { FileKind } from '../../../shared/files';

type Services = Pick<AppServices, 'data' | 'online'>;

/** Starts a background upload/delete pass. Never awaited by screens, never throws (golden rule). */
export function syncFilesSoon(services: Services): void {
  void services.online?.files?.run().catch(() => null);
}

/** Queues a cloud copy of a stored image under kind + ref (replacing the previous one) and starts syncing. */
export async function queueImageCopy(services: Services, kind: FileKind, ref: string | null, imageId: string): Promise<void> {
  const blob = await services.data.repos.images.getBlob(imageId);
  await services.data.repos.cloudFiles.put(kind, ref, { imageId, mime: blob?.type || 'image/jpeg' });
  syncFilesSoon(services);
}

/** Queues raw bytes (a PDF) under kind + ref and starts syncing. */
export async function queueBytesCopy(services: Services, kind: FileKind, ref: string, bytes: Uint8Array, mime: string, name?: string): Promise<void> {
  await services.data.repos.cloudFiles.put(kind, ref, { bytes, mime, ...(name ? { name } : {}) });
  syncFilesSoon(services);
}

/** Removes the cloud copies of kind + ref (now if never uploaded, otherwise on the next sync). */
export async function dropCopies(services: Services, ref: string | null, kinds: readonly FileKind[]): Promise<void> {
  for (const kind of kinds) await services.data.repos.cloudFiles.remove(kind, ref);
  syncFilesSoon(services);
}
