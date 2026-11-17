import { useLive } from '@/app/useLive';
import type { ProgressEntry } from '@/domain/models';
import { useNutritionStore } from '../shared/useNutritionStore';

/**
 * Full photo id → thumbnail id for the given entries (photos saved before thumbnails were kept, or that came
 * from a check-in without one, map to nothing and show the full image).
 */
export function useThumbs(entries: readonly ProgressEntry[] | undefined): ReadonlyMap<string, string> {
  const store = useNutritionStore();
  const ids = (entries ?? []).filter((e) => e.photoIds.length > 0).map((e) => e.id);
  const key = ids.join(',');
  const map = useLive(async () => {
    const lists = await Promise.all(ids.map((id) => store.getEntryPhotos(id).catch(() => [])));
    return new Map(lists.flat().map((p) => [p.imageId, p.thumbId]));
  }, [store, key]);
  return map ?? EMPTY;
}

const EMPTY: ReadonlyMap<string, string> = new Map();
