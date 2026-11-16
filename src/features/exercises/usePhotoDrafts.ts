import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/services';
import type { DownscaledImage } from '@/services/storage';

export interface PhotoDraft extends DownscaledImage {
  key: number;
  url: string;
}

export const MAX_PHOTOS = 2;
const MAX_SIDE = 1200;

/** Picked photos, downscaled right away (iOS storage pressure), previewed via object URLs. */
export function usePhotoDrafts() {
  const { images, data } = useServices();
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const [failed, setFailed] = useState(false);
  const urls = useRef(new Set<string>());
  const nextKey = useRef(1);

  useEffect(() => {
    const owned = urls.current;
    return () => owned.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const add = useCallback(
    async (files: FileList | null) => {
      setFailed(false);
      for (const file of Array.from(files ?? []).slice(0, MAX_PHOTOS)) {
        try {
          const small = await images.downscale(file, MAX_SIDE);
          const url = URL.createObjectURL(small.blob);
          urls.current.add(url);
          setDrafts((d) => [...d, { ...small, url, key: nextKey.current++ }].slice(-MAX_PHOTOS));
        } catch {
          setFailed(true);
        }
      }
    },
    [images],
  );

  const remove = useCallback((key: number) => setDrafts((d) => d.filter((p) => p.key !== key)), []);

  /** Stores the drafts in the images table; returns their ids. */
  const save = useCallback(
    async (list: readonly PhotoDraft[]) => {
      const ids: string[] = [];
      for (const p of list) ids.push((await data.repos.images.save({ blob: p.blob, width: p.width, height: p.height })).id);
      return ids;
    },
    [data],
  );

  /** Downscales and stores picked files directly (replace photo); returns their ids. */
  const storeFiles = useCallback(
    async (files: readonly File[]) => {
      const ids: string[] = [];
      for (const file of files.slice(0, MAX_PHOTOS)) {
        const small = await images.downscale(file, MAX_SIDE);
        ids.push((await data.repos.images.save(small)).id);
      }
      return ids;
    },
    [images, data],
  );

  return { drafts, failed, add, remove, save, storeFiles };
}
