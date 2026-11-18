import { useRef, useState } from 'react';
import type { CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { cx } from '@/ui';
import { ExercisePhoto } from './ExerciseThumb';
import { IllustrationImage } from './IllustrationImage';
import styles from './ExerciseDetail.module.css';

/**
 * The trainer's photos, else the library photos (start/end), then our own muscle-target picture, side by side
 * with native swipe (scroll snap) and position dots. With no photo at all the picture is the only slide.
 */
export function PhotoCarousel({ exercise }: { exercise: CatalogExercise }) {
  const images = exercise.images.length > 0 ? exercise.images : [undefined];
  const withPicture = exercise.images.length > 0;
  const total = images.length + (withPicture ? 1 : 0);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(total - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };
  return (
    <div className={styles.carousel}>
      <div ref={track} className={styles.track} onScroll={onScroll} aria-label={t('training.library.detail.photos')} role="group">
        {images.map((image, i) => (
          <div
            key={image ? (image.kind === 'pack' ? image.path : image.imageId) : 'none'}
            className={styles.slide}
            role="group"
            aria-label={t('training.library.detail.photo', { n: i + 1, total })}
          >
            {image === undefined ? (
              // No photo at all: the muscle picture, labelled so it never reads as an empty or broken box.
              <span className={cx(styles.photo, styles.pictureSlide)}>
                <IllustrationImage exercise={exercise} fallbackSize={200} />
                <span className={styles.pictureBadge}>{t('exercises.detail.illustration')}</span>
              </span>
            ) : (
              <ExercisePhoto exercise={exercise} image={image} fallbackSize={200} className={styles.photo} eager={i === 0} />
            )}
          </div>
        ))}
        {withPicture && (
          <div className={styles.slide} role="group" aria-label={t('exercises.detail.illustrationSlide')}>
            <span className={cx(styles.photo, styles.pictureSlide)}>
              <IllustrationImage exercise={exercise} fallbackSize={200} />
              <span className={styles.pictureBadge}>{t('exercises.detail.illustration')}</span>
            </span>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx(styles.dot, i === index && styles.dotOn)} />
          ))}
        </div>
      )}
    </div>
  );
}
