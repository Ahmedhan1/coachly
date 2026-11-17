import type { AppServices } from '@/app/services';

export const PHOTO_MAX_SIDE = 1200;
export const THUMB_MAX_SIDE = 320;

/** Downscales a picked photo to ≤1200 px and stores it plus a small thumbnail. */
export async function storePhoto(services: Pick<AppServices, 'images' | 'data'>, file: Blob): Promise<{ imageId: string; thumbId: string }> {
  const full = await services.images.downscale(file, PHOTO_MAX_SIDE);
  const thumb = await services.images.downscale(full.blob, THUMB_MAX_SIDE);
  const savedFull = await services.data.repos.images.save(full);
  const savedThumb = await services.data.repos.images.save(thumb);
  return { imageId: savedFull.id, thumbId: savedThumb.id };
}
