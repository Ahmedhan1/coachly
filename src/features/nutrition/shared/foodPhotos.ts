/** Bundled food photos live in public/food-img/photos and are cached on first view by the service worker. */
export const FOOD_PHOTO_CACHE = 'food-photos';

export function foodPhotoUrl(stem: string): string {
  return `/food-img/photos/${stem}.webp`;
}

export interface FoodPhotoProgress {
  done: number;
  total: number;
  failed: number;
}

/** How many of these photos are already stored for offline use (0 when the Cache API is missing). */
export async function cachedFoodPhotoCount(stems: readonly string[]): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  try {
    const cache = await caches.open(FOOD_PHOTO_CACHE);
    const keys = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    return stems.filter((s) => keys.has(foodPhotoUrl(s))).length;
  } catch {
    return 0;
  }
}

/**
 * Stores every photo in the same cache the service worker reads, so recipes and foods show their photo offline.
 * Already-stored photos are skipped; a failed one is counted and skipped (the icon shows instead). Never throws.
 */
export async function downloadFoodPhotos(stems: readonly string[], onProgress: (p: FoodPhotoProgress) => void, signal?: AbortSignal): Promise<FoodPhotoProgress> {
  const unique = [...new Set(stems)];
  const progress: FoodPhotoProgress = { done: 0, total: unique.length, failed: 0 };
  if (typeof caches === 'undefined') return { ...progress, failed: unique.length };
  let cache: Cache;
  try {
    cache = await caches.open(FOOD_PHOTO_CACHE);
  } catch {
    return { ...progress, failed: unique.length };
  }
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const queue = [...unique];
  const worker = async () => {
    for (let stem = queue.shift(); stem !== undefined && !signal?.aborted; stem = queue.shift()) {
      const url = foodPhotoUrl(stem);
      if (!have.has(url)) {
        try {
          const res = await fetch(url, { signal: signal ?? null });
          if (res.ok) await cache.put(url, res);
          else progress.failed += 1;
        } catch {
          progress.failed += 1;
        }
      }
      progress.done += 1;
      onProgress({ ...progress });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { ...progress };
}
