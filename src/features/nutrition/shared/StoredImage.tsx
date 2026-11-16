import { useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/services';
import { Icon, type IconName } from '@/ui';
import { cx } from '@/ui';
import styles from './StoredImage.module.css';

interface StoredImageProps {
  imageId: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIcon?: IconName;
  /** Load only when scrolled near the viewport (long lists). */
  lazy?: boolean;
}

/**
 * Shows an image Blob from the images table through an object URL that is revoked when the image changes
 * or unmounts, so hundreds of progress thumbnails do not leak memory.
 */
export function StoredImage({ imageId, alt, className, fallbackIcon = 'image', lazy = false }: StoredImageProps) {
  const { data } = useServices();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!lazy || visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!imageId || !visible) return;
    let url: string | null = null;
    let cancelled = false;
    void data.repos.images.getBlob(imageId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setLoaded({ id: imageId, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data, imageId, visible]);

  const url = loaded && loaded.id === imageId ? loaded.url : null;
  return (
    <span ref={ref} className={cx(styles.frame, className)}>
      {url ? (
        <img src={url} alt={alt} className={styles.img} decoding="async" draggable={false} />
      ) : (
        <span className={styles.placeholder} role={imageId ? undefined : 'presentation'} aria-label={imageId ? alt : undefined}>
          <Icon name={fallbackIcon} />
        </span>
      )}
    </span>
  );
}
