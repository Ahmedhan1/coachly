export type PersistOutcome = 'granted' | 'denied' | 'unsupported';

export interface StorageEstimateResult {
  usageBytes: number;
  quotaBytes: number;
}

/** Wraps navigator.storage so screens and tests do not touch the browser API directly. */
export interface StorageService {
  /** Asks the browser to keep our data under storage pressure. Safe to call repeatedly. */
  requestPersistence(): Promise<PersistOutcome>;
  isPersisted(): Promise<boolean>;
  /** null when the browser cannot estimate. */
  estimate(): Promise<StorageEstimateResult | null>;
}

export interface DownscaledImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Shrinks photos before they are stored so iOS storage pressure is less likely to evict us. */
export interface ImageDownscaler {
  downscale(input: Blob, maxSide?: number): Promise<DownscaledImage>;
}

export const DEFAULT_MAX_IMAGE_SIDE = 1200;
export const DEFAULT_JPEG_QUALITY = 0.82;
