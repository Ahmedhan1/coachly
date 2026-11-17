import { buildStorageReport, estimateClientCapacity, type StorageReport } from '@/domain/backup';
import type { AppDatabase } from '@/data/db';
import { deleteUnreferencedImages, readImageBlob, readImageOwners, replaceImageBlob } from '@/data/backupIO';
import type { ImageDownscaler, StorageEstimateResult, StorageService } from './types';

/** Photos are re-saved at this size by the "shrink big photos" tool (same as import). */
export const SHRINK_MAX_SIDE = 1200;

export interface DeviceStorageReport extends StorageReport {
  estimate: StorageEstimateResult | null;
  persisted: boolean;
  clientCount: number;
  /** Rough number of extra clients (with photos) that still fit. null = unknown. */
  clientsThatFit: number | null;
  /** Everything that is not a photo in the database: data rows, the app's offline files, exercise pack. */
  otherBytes: number | null;
}

export interface ShrinkResult {
  shrunk: number;
  savedBytes: number;
}

/** Storage card logic: report, safe cleanup of unused photos, and re-compressing photos saved too large. */
export class StorageCleanupService {
  constructor(
    private readonly deps: { db: AppDatabase; storage: StorageService; images: ImageDownscaler; now?: () => Date },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async report(): Promise<DeviceStorageReport> {
    const [owners, estimate, persisted] = await Promise.all([
      readImageOwners(this.deps.db),
      this.deps.storage.estimate(),
      this.deps.storage.isPersisted(),
    ]);
    const report = buildStorageReport(owners.images, owners.owners, this.now());
    const clientsThatFit = estimate
      ? estimateClientCapacity({
          quotaBytes: estimate.quotaBytes,
          usageBytes: estimate.usageBytes,
          clientCount: owners.clientCount,
          clientPhotoBytes: report.byCategory.clientPhotos.bytes,
        })
      : null;
    return {
      ...report,
      estimate,
      persisted,
      clientCount: owners.clientCount,
      clientsThatFit,
      otherBytes: estimate ? Math.max(0, estimate.usageBytes - report.imageBytes) : null,
    };
  }

  /** Deletes photos nothing uses (re-checked in one transaction, so nothing in use can go). */
  async deleteUnused(ids: readonly string[]): Promise<{ deleted: number; bytes: number }> {
    try {
      return await deleteUnreferencedImages(this.deps.db, ids, this.now());
    } catch {
      return { deleted: 0, bytes: 0 };
    }
  }

  /**
   * Re-saves big JPEG photos at the import size, keeping their ids. A photo is only replaced when the new
   * file is actually smaller; any failure leaves that photo untouched.
   */
  async shrink(ids: readonly string[], onProgress?: (done: number, total: number) => void): Promise<ShrinkResult> {
    let shrunk = 0;
    let savedBytes = 0;
    let done = 0;
    for (const id of ids) {
      try {
        const blob = await readImageBlob(this.deps.db, id);
        if (blob && blob.type === 'image/jpeg') {
          const small = await this.deps.images.downscale(blob, SHRINK_MAX_SIDE);
          if (small.blob.size > 0 && small.blob.size < blob.size && (small.blob.type === 'image/jpeg' || small.blob.type === 'image/png')) {
            if (await replaceImageBlob(this.deps.db, id, small)) {
              shrunk += 1;
              savedBytes += blob.size - small.blob.size;
            }
          }
        }
      } catch {
        // keep this photo as it is
      }
      done += 1;
      onProgress?.(done, ids.length);
    }
    return { shrunk, savedBytes };
  }
}
