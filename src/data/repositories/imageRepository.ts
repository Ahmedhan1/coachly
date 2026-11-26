import { imageMetaSchema, type ImageId, type ImageMeta } from '@/domain/models';
import { fromImageRow, toImageRow } from '../db';
import type { RepositoryContext } from './entityRepository';

export interface NewImage {
  blob: Blob;
  width: number;
  height: number;
  demo?: boolean;
}

/** Device-local meta flag: every image row has been rewritten as bytes (see migrateBlobsToBytes). */
export const BYTES_MIGRATED_KEY = 'device.imagesAsBytes';

/** What a migration pass did: legacy Blob rows rewritten as bytes, and ones already unreadable. */
export interface ImageMigrationReport {
  migrated: number;
  unreadable: number;
}

/**
 * Images live in their own table so entity rows stay small; entities hold only `ImageId`s. They are stored as
 * raw bytes, never as Blobs (see ImageRow in db.ts for why WebKit makes that necessary); callers still pass
 * and receive Blobs. Callers downscale before saving (see services/storage ImageDownscaler).
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
    await this.ctx.db.images.add(await toImageRow({ ...meta, blob: image.blob }));
    return meta;
  }

  async getBlob(id: ImageId | string): Promise<Blob | undefined> {
    return fromImageRow(await this.ctx.db.images.get(id))?.blob;
  }

  /**
   * Rewrites rows saved as Blobs (before 2026-11-27) as bytes, one at a time, while they can still be read.
   * Rows whose Blob iOS already lost stay as they are and are counted (nothing can bring them back). Runs its
   * scan once: a meta flag records that it finished, so later starts return at once.
   */
  async migrateBlobsToBytes(): Promise<ImageMigrationReport> {
    if ((await this.ctx.db.meta.get(BYTES_MIGRATED_KEY))?.value === true) return { migrated: 0, unreadable: 0 };
    const ids = (await this.ctx.db.images.filter((r) => !r.data && r.blob !== undefined).primaryKeys()).map(String);
    const report: ImageMigrationReport = { migrated: 0, unreadable: 0 };
    for (const id of ids) {
      const row = await this.ctx.db.images.get(id);
      const record = fromImageRow(row);
      if (!row || row.data || !record) continue;
      let next;
      try {
        next = await toImageRow(record);
      } catch {
        report.unreadable++;
        continue;
      }
      await this.ctx.db.images.put({ ...next, bytes: next.data?.byteLength ?? row.bytes });
      report.migrated++;
    }
    await this.ctx.db.meta.put({ key: BYTES_MIGRATED_KEY, value: true });
    return report;
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
