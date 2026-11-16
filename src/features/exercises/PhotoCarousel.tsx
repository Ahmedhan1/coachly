import { useRef, useState } from 'react';
import type { CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { cx } from '@/ui';
import { ExercisePhoto } from './ExerciseThumb';
import styles from './ExerciseDetail.module.css';

/** Start/end photos side by side with native swipe (scroll snap) and position dots. */
export function PhotoCarousel({ exercise }: { exercise: CatalogExercise }) {
  const images = exercise.images.length > 0 ? exercise.images : [undefined];
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(images.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };
  return (
    <div className={styles.carousel}>
      <div ref={track} className={styles.track} onScroll={onScroll} aria-label={t('training.library.detail.photos')} role="group">
        {images.map((image, i) => (
          <div
            key={image ? (image.kind === 'pack' ? image.path : image.imageId) : 'none'}
            className={styles.slide}
            role="group"
            aria-label={t('training.library.detail.photo', { n: i + 1, total: images.length })}
          >
            <ExercisePhoto exercise={exercise} image={image} fallbackSize={200} className={styles.photo} eager={i === 0} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {images.map((_, i) => (
            <span key={i} className={cx(styles.dot, i === index && styles.dotOn)} />
          ))}
        </div>
      )}
    </div>
  );
}
