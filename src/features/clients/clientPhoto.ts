import type { AppServices } from '@/app/services';
import type { Client, ImageId } from '@/domain/models';
import { dropCopies, queueImageCopy } from '@/features/files/cloudCopies';
import { storePhoto, THUMB_MAX_SIDE } from '@/features/nutrition/shared/photos';

type Services = Pick<AppServices, 'data' | 'images' | 'online'>;

async function deleteImages(services: Services, ids: ReadonlyArray<string | null | undefined>): Promise<void> {
  for (const id of ids) if (id) await services.data.repos.images.delete(id).catch(() => undefined);
}

async function applyPhoto(services: Services, client: Client, imageId: string, thumbId: string): Promise<void> {
  await services.data.repos.clients.update(client.id, { photoId: imageId as ImageId, photoThumbId: thumbId as ImageId });
  await deleteImages(services, [client.photoId, client.photoThumbId]);
  // Encrypted cloud copies: the photo and its thumbnail, named by the client id (never the name).
  await queueImageCopy(services, 'client_photo', client.id, imageId);
  await queueImageCopy(services, 'thumbnail', client.id, thumbId);
}

/** The trainer picked or took a photo of the client: downscale (≤1200 px + 320 px thumb), store, queue upload. */
export async function setClientPhoto(services: Services, client: Client, file: Blob): Promise<void> {
  const { imageId, thumbId } = await storePhoto(services, file);
  await applyPhoto(services, client, imageId, thumbId);
}

/** A photo the client uploaded from their page (already stored on the phone by the sync). */
export async function setClientPhotoFromImage(services: Services, client: Client, imageId: string): Promise<void> {
  const blob = await services.data.repos.images.getBlob(imageId);
  if (!blob) return;
  const thumb = await services.data.repos.images.save(await services.images.downscale(blob, THUMB_MAX_SIDE));
  await applyPhoto(services, client, imageId, thumb.id);
}

export async function removeClientPhoto(services: Services, client: Client): Promise<void> {
  await services.data.repos.clients.update(client.id, { photoId: null, photoThumbId: null });
  await deleteImages(services, [client.photoId, client.photoThumbId]);
  await dropCopies(services, client.id, ['client_photo', 'thumbnail']);
}
