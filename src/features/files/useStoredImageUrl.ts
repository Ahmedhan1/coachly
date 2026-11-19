import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';

/** Object URL for a stored image; revoked when the id changes or the component unmounts. */
export function useStoredImageUrl(id: string | null | undefined): string | null {
  const { data } = useServices();
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void data.repos.images.getBlob(id).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ id, url: objectUrl });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data, id]);
  return id && loaded && loaded.id === id ? loaded.url : null;
}
