import { memo, useState } from 'react';
import { muscleLoadForExercise, type CatalogExercise, type ExerciseImage } from '@/domain/exercises';
import { t } from '@/i18n';
import { cx } from '@/ui';
import { intensitiesFromLoad, MuscleMap, VIEW_PATHS } from '@/ui/MuscleMap';
import { useImageUrl } from './useImageUrl';
import styles from './ExerciseThumb.module.css';

/** Front view unless the main target is drawn only on the back. */
export function bestView(exercise: CatalogExercise): 'front' | 'back' {
  const first = exercise.primaryMuscles[0];
  if (first === undefined) return 'front';
  return VIEW_PATHS.front.some(([id]) => id === first) ? 'front' : 'back';
}

export function MuscleFallback({ exercise, size }: { exercise: CatalogExercise; size: number }) {
  return (
    <MuscleMap
      view={bestView(exercise)}
      size={size}
      intensities={intensitiesFromLoad(muscleLoadForExercise(exercise))}
      label={t('training.library.photoFallback')}
    />
  );
}

interface PhotoProps {
  exercise: CatalogExercise;
  image: ExerciseImage | undefined;
  /** Size of the muscle map shown when there is no photo. */
  fallbackSize: number;
  className?: string;
  eager?: boolean;
}

/** Exercise photo with a muscle-map fallback when it is missing, offline-uncached or fails to load. */
export function ExercisePhoto({ exercise, image, fallbackSize, className, eager }: PhotoProps) {
  const url = useImageUrl(image);
  const [failed, setFailed] = useState<string | null>(null);
  const broken = url === null || failed === url;
  return (
    <span className={cx(styles.slot, className)}>
      {broken ? (
        image?.kind === 'stored' && url === null ? null : <MuscleFallback exercise={exercise} size={fallbackSize} />
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
