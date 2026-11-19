import { err, ok, type Result } from '../nutrition/result';
import type { ImageVariant } from './manifest';

export type SchemaAction = 'same' | 'migrate';
export type SchemaError = 'newer_schema' | 'invalid_schema';

/**
 * Version policy for restoring: same version restores directly, an older one goes through the app's
 * migrations first, a newer one is refused (this app cannot know what the newer fields mean).
 */
export function schemaAction(backupVersion: number, currentVersion: number): Result<SchemaAction, SchemaError> {
  if (!Number.isInteger(backupVersion) || backupVersion < 1) return err('invalid_schema');
  if (backupVersion > currentVersion) return err('newer_schema');
  return ok(backupVersion === currentVersion ? 'same' : 'migrate');
}

const MB = 1024 * 1024;

/** docs/LIMITS.md: 500 trainers fit in R2 only if the average cloud backup stays at or under ~18 MB. */
export const DEFAULT_CLOUD_BUDGET_BYTES = 18 * MB;
/** docs/LIMITS.md: per-trainer cap. */
export const CLOUD_HARD_CAP_BYTES = 100 * MB;
/** docs/LIMITS.md: cloud photo thumbnails are ~400 px, ~30 KB each. */
export const THUMBNAIL_MAX_SIDE = 400;
export const THUMBNAIL_ESTIMATED_BYTES = 30 * 1024;

export interface CloudSizeEstimate {
  /** Rough size of the table JSON after compression. */
  dataBytes: number;
  imageCount: number;
  fullImageBytes: number;
}

export function estimatedArchiveBytes(e: CloudSizeEstimate, variant: ImageVariant): number {
  if (variant === 'full') return e.dataBytes + e.fullImageBytes;
  if (variant === 'thumbnail') return e.dataBytes + Math.min(e.fullImageBytes, e.imageCount * THUMBNAIL_ESTIMATED_BYTES);
  return e.dataBytes;
}

const ORDER: readonly ImageVariant[] = ['full', 'thumbnail', 'none'];

/** The next smaller variant, or null when there is nothing left to drop (data is never dropped). */
export function downgradeVariant(v: ImageVariant): ImageVariant | null {
  return ORDER[ORDER.indexOf(v) + 1] ?? null;
}

/** The smaller of two variants. */
export function smallerVariant(a: ImageVariant, b: ImageVariant): ImageVariant {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/**
 * Largest variant whose estimated archive fits the budget, never above `ceiling` (lowered after the server
 * said `storage_full`). Falls back to data only, which is always attempted.
 */
export function chooseCloudVariant(
  e: CloudSizeEstimate,
  budgetBytes: number = DEFAULT_CLOUD_BUDGET_BYTES,
  ceiling: ImageVariant = 'full',
): ImageVariant {
  for (const v of ORDER.slice(ORDER.indexOf(ceiling))) {
    if (v === 'none' || estimatedArchiveBytes(e, v) <= budgetBytes) return v;
  }
  return 'none';
}
