import { useEffect, useState } from 'react';
import { useRepos } from '@/app/services';
import type { ExerciseImage } from '@/domain/exercises';

/** URL for an exercise image: the pack path as is, or an object URL for a stored trainer photo. */
export function useImageUrl(image: ExerciseImage | undefined): string | null {
  const repos = useRepos();
  const storedId = image?.kind === 'stored' ? image.imageId : null;
  const [stored, setStored] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (storedId === null) return;
    let url: string | null = null;
    let alive = true;
    void repos.images.getBlob(storedId).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setStored({ id: storedId, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [repos, storedId]);
  if (!image) return null;
  if (image.kind === 'pack') return image.path;
  return stored?.id === image.imageId ? stored.url : null;
}
