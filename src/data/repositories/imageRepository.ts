import { imageMetaSchema, type ImageId, type ImageMeta } from '@/domain/models';
import type { ImageRecord } from '../db';
import type { RepositoryContext } from './entityRepository';

export interface NewImage {
  blob: Blob;
  width: number;
  height: number;
  demo?: boolean;
}

/**
 * Images are Blobs in their own table so entity rows stay small; entities hold only `ImageId`s.
 * Callers downscale before saving (see services/storage ImageDownscaler).
 */
export class ImageRepository {
  constructor(private readonly ctx: RepositoryContext) {}

  async save(image: NewImage): Promise<ImageMeta> {
    const meta = imageMetaSchema.parse({
      id: this.ctx.newId(),
      mime: image.blob.type,
      width: image.width,
      height: image.height,
      bytes: image.blob.size,
      createdAt: this.ctx.clock(),
      demo: image.demo ?? false,
    });
    const record: ImageRecord = { ...meta, blob: image.blob };
    await this.ctx.db.images.add(record);
    return meta;
  }

  async getBlob(id: ImageId | string): Promise<Blob | undefined> {
    return (await this.ctx.db.images.get(id))?.blob;
  }

  async delete(id: ImageId | string): Promise<void> {
    await this.ctx.db.images.delete(id);
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    await this.ctx.db.images.each((img) => {
      total += img.bytes;
    });
    return total;
  }
}
