/**
 * On-device storage report: which photos belong to what, what is safe to clean up, and roughly how many more
 * clients fit. Pure: the data layer gathers rows, this decides.
 */

export type StorageCategory = 'clientPhotos' | 'exercisePhotos' | 'foodPhotos' | 'branding' | 'other';

export const STORAGE_CATEGORIES: readonly StorageCategory[] = ['clientPhotos', 'exercisePhotos', 'foodPhotos', 'branding', 'other'];

const DAY_MS = 86_400_000;
const KB = 1024;
const MB = 1024 * KB;

/** Unused photos younger than this are kept: a sheet may have saved a photo whose entry is not saved yet. */
export const ORPHAN_GRACE_MS = DAY_MS;
/** A stored photo above either limit was saved before import compression and can be shrunk. */
export const LARGE_IMAGE_BYTES = 450 * KB;
export const LARGE_IMAGE_SIDE = 1600;
/** Used when there are too few clients to measure: ~12 progress photos (~220 KB + thumbnail) and their data. */
export const DEFAULT_BYTES_PER_CLIENT = 3 * MB;
const MIN_BYTES_PER_CLIENT = 300 * KB;
/** The browser needs headroom; never promise the last 10% of the quota. */
const QUOTA_SAFETY = 0.9;

/** Which part of the app a row of `table` (or a meta key) belongs to. */
export function categoryForSource(table: string, metaKey?: string): StorageCategory {
  if (table === 'meta') {
    const key = metaKey ?? '';
    if (key.startsWith('progress.') || key.startsWith('client')) return 'clientPhotos';
    if (key.startsWith('nutrition.') || key.startsWith('supplements.') || key.startsWith('food')) return 'foodPhotos';
    if (key.startsWith('exercise')) return 'exercisePhotos';
    if (key.startsWith('identity') || key.startsWith('brand') || key.startsWith('pdf')) return 'branding';
    return 'other';
  }
  switch (table) {
    case 'clients':
    case 'progress':
    case 'workoutLogs':
    case 'sessions':
    case 'payments':
      return 'clientPhotos';
    case 'exercises':
    case 'programs':
      return 'exercisePhotos';
    case 'recipes':
    case 'mealPlans':
    case 'supplements':
    case 'foods':
    case 'ingredients':
      return 'foodPhotos';
    case 'settings':
    case 'pdfTemplates':
      return 'branding';
    default:
      return 'other';
  }
}

/**
 * Adds every string inside `value` (any depth) that is a known image id to `found`. Scanning whole rows
 * instead of named fields means a photo referenced by a field added later is never mistaken for unused.
 */
export function collectImageRefs(value: unknown, imageIds: ReadonlySet<string>, found: Set<string>, depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (imageIds.has(value)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageRefs(item, imageIds, found, depth + 1);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value as Record<string, unknown>)) collectImageRefs(item, imageIds, found, depth + 1);
  }
}

export interface StoredImageInfo {
  id: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: number;
}

export interface CategoryUsage {
  count: number;
  bytes: number;
}

export interface StorageReport {
  byCategory: Record<StorageCategory, CategoryUsage>;
  imageBytes: number;
  /** Photos nothing points to, older than the grace period: safe to delete. */
  unused: { ids: string[]; bytes: number };
  /** JPEG photos that are bigger than the import size: can be re-saved smaller (same id, same place). */
  oversized: { ids: string[]; bytes: number };
}

function emptyUsage(): Record<StorageCategory, CategoryUsage> {
  return {
    clientPhotos: { count: 0, bytes: 0 },
    exercisePhotos: { count: 0, bytes: 0 },
    foodPhotos: { count: 0, bytes: 0 },
    branding: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };
}

/**
 * `owners` maps image id → the category of the first row that references it. Images with no owner count as
 * `other` until they are old enough to be offered for cleanup.
 */
export function buildStorageReport(images: readonly StoredImageInfo[], owners: ReadonlyMap<string, StorageCategory>, now: Date): StorageReport {
  const byCategory = emptyUsage();
  const unused = { ids: [] as string[], bytes: 0 };
  const oversized = { ids: [] as string[], bytes: 0 };
  let imageBytes = 0;
  for (const img of images) {
    imageBytes += img.bytes;
    const owner = owners.get(img.id);
    const usage = byCategory[owner ?? 'other'];
    usage.count += 1;
    usage.bytes += img.bytes;
    if (owner === undefined) {
      if (now.getTime() - img.createdAt >= ORPHAN_GRACE_MS) {
        unused.ids.push(img.id);
        unused.bytes += img.bytes;
      }
      continue;
    }
    const big = img.bytes > LARGE_IMAGE_BYTES || Math.max(img.width, img.height) > LARGE_IMAGE_SIDE;
    // PNG/WebP may be a transparent logo; re-encoding as JPEG would paint the background black.
    if (big && img.mime === 'image/jpeg') {
      oversized.ids.push(img.id);
      oversized.bytes += img.bytes;
    }
  }
  return { byCategory, imageBytes, unused, oversized };
}

export interface CapacityInput {
  quotaBytes: number;
  usageBytes: number;
  clientCount: number;
  clientPhotoBytes: number;
}

/** Bytes one more client is expected to take, measured from existing clients when there are enough. */
export function bytesPerClient(input: Pick<CapacityInput, 'clientCount' | 'clientPhotoBytes'>): number {
  if (input.clientCount < 3) return DEFAULT_BYTES_PER_CLIENT;
  return Math.max(MIN_BYTES_PER_CLIENT, Math.round(input.clientPhotoBytes / input.clientCount) + 100 * KB);
}

/** "Room for about N more clients with their photos", rounded down to a friendly number. null = unknown. */
export function estimateClientCapacity(input: CapacityInput): number | null {
  if (!(input.quotaBytes > 0) || input.usageBytes < 0) return null;
  const free = input.quotaBytes * QUOTA_SAFETY - input.usageBytes;
  if (free <= 0) return 0;
  return friendlyFloor(Math.floor(free / bytesPerClient(input)));
}

export function friendlyFloor(n: number): number {
  if (n < 20) return Math.max(0, n);
  if (n < 1000) return Math.floor(n / 10) * 10;
  if (n < 10_000) return Math.floor(n / 100) * 100;
  return Math.floor(n / 1000) * 1000;
}

/** How full the device storage is, for the card's tone. */
export function storagePressure(quotaBytes: number, usageBytes: number): 'ok' | 'high' | 'critical' {
  if (!(quotaBytes > 0)) return 'ok';
  const ratio = usageBytes / quotaBytes;
  if (ratio >= 0.9) return 'critical';
  return ratio >= 0.7 ? 'high' : 'ok';
}
