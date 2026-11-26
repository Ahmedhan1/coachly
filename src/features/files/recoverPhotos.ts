import type { AppServices } from '@/app/services';
import type { ImageId } from '@/domain/models';
import { storePhoto } from '@/features/nutrition/shared/photos';
import type { CloudFileInfo } from '../../../shared/files';

type Services = Pick<AppServices, 'data' | 'images' | 'online'>;

/**
 * Brings full-size photos back from the encrypted cloud copies (the bucket) after a restore. A cloud backup may
 * carry only thumbnails (or no photos) to stay small; the photos themselves were uploaded separately and only
 * this phone's files key (restored with the backup) can open them. Replaces a local picture only when it is
 * missing or clearly smaller than the cloud copy. Returns how many photos came back. Never throws.
 */
export async function recoverPhotos(services: Services): Promise<number> {
  const files = services.online?.files;
  if (!files) return 0;
  try {
    let recovered = 0;
    const clientPhotos = (await files.remoteFiles('client_photo')) ?? [];
    for (const remote of clientPhotos) {
      if (remote.ref === null) continue;
      const client = await services.data.repos.clients.get(remote.ref).catch(() => undefined);
      if (!client || client.deletedAt !== null) continue;
      if (!(await needsCloudCopy(services, client.photoId, remote))) continue;
      const stored = await download(services, remote);
      if (stored === null) continue;
      await services.data.repos.clients.update(client.id, { photoId: stored.imageId as ImageId, photoThumbId: stored.thumbId as ImageId });
      await services.data.repos.cloudFiles.adopt('client_photo', client.id, remote.id, { imageId: stored.imageId, mime: 'image/jpeg' });
      recovered += 1;
    }
    const trainerPhoto = ((await files.remoteFiles('trainer_photo')) ?? []).find((f) => f.ref === null);
    if (trainerPhoto) {
      const settings = await services.data.repos.settings.get();
      if (await needsCloudCopy(services, settings.photoImageId ?? null, trainerPhoto)) {
        const stored = await download(services, trainerPhoto);
        if (stored !== null) {
          await services.data.repos.settings.update({ photoImageId: stored.imageId as ImageId });
          await services.data.repos.cloudFiles.adopt('trainer_photo', null, trainerPhoto.id, { imageId: stored.imageId, mime: 'image/jpeg' });
          recovered += 1;
        }
      }
    }
    return recovered;
  } catch {
    return 0;
  }
}

/** Missing locally, or the local picture is under half the size of the cloud copy (a thumbnail-only restore). */
async function needsCloudCopy(services: Services, imageId: string | null, remote: CloudFileInfo): Promise<boolean> {
  if (imageId === null) return true;
  const blob = await services.data.repos.images.getBlob(imageId);
  return blob === undefined || blob.size * 2 < remote.size;
}

async function download(services: Services, remote: CloudFileInfo): Promise<{ imageId: string; thumbId: string } | null> {
  const opened = await services.online?.files?.open(remote.id);
  if (!opened || !opened.mime.startsWith('image/')) return null;
  try {
    return await storePhoto(services, new Blob([opened.bytes as BlobPart], { type: opened.mime }));
  } catch {
    return null;
  }
}
