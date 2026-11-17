import { memo, useState } from 'react';
import type { CatalogExercise, ExerciseImage } from '@/domain/exercises';
import { cx } from '@/ui';
import { IllustrationImage } from './IllustrationImage';
import { useImageUrl } from './useImageUrl';
import styles from './ExerciseThumb.module.css';

interface PhotoProps {
  exercise: CatalogExercise;
  image: ExerciseImage | undefined;
  /** Size of the muscle map shown when there is no photo. */
  fallbackSize: number;
  className?: string;
  eager?: boolean;
}

/** Exercise photo (the trainer's own first); our muscle-target picture when it is missing, offline-uncached or fails to load. */
export function ExercisePhoto({ exercise, image, fallbackSize, className, eager }: PhotoProps) {
  const url = useImageUrl(image);
  const [failed, setFailed] = useState<string | null>(null);
  const broken = url === null || failed === url;
  return (
    <span className={cx(styles.slot, className)}>
      {broken ? (
        image?.kind === 'stored' && url === null ? null : <IllustrationImage exercise={exercise} fallbackSize={fallbackSize} />
      ) : (
        <img
          src={url}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={styles.img}
          onError={() => setFailed(url)}
        />
      )}
    </span>
  );
}

/** 64pt list thumbnail. */
export const ExerciseThumb = memo(function ExerciseThumb({ exercise }: { exercise: CatalogExercise }) {
  return <ExercisePhoto exercise={exercise} image={exercise.images[0]} fallbackSize={56} className={styles.thumb} />;
});
