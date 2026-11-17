import { useState } from 'react';
import { muscleLoadForExercise, type CatalogExercise } from '@/domain/exercises';
import { cx } from '@/ui';
import { MuscleMap, intensitiesFromLoad } from '@/ui/MuscleMap';
import styles from './Shared.module.css';

export interface ExerciseThumbProps {
  exercise: CatalogExercise | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** A1/A2 superset tag drawn on the photo. */
  tag?: string;
  className?: string;
}

function packImage(exercise: CatalogExercise | undefined): string | null {
  const image = exercise?.images.find((i) => i.kind === 'pack');
  return image?.kind === 'pack' ? image.path : null;
}

/**
 * Exercise photo slot (DESIGN.md §5): the pack photo with the muscle map in a corner badge. Falls back to
 * the muscle map alone when there is no photo (offline and not cached, 404, trainer-only exercise).
 */
export function ExerciseThumb({ exercise, size = 'md', tag, className }: ExerciseThumbProps) {
  const src = packImage(exercise);
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src !== null && failed !== src;
  const intensities = exercise ? intensitiesFromLoad(muscleLoadForExercise(exercise)) : {};
  const view = exercise?.primaryMuscles.some((m) => ['glutes', 'hamstrings', 'lats', 'triceps', 'calves', 'lower_back', 'middle_back', 'traps'].includes(m)) ? 'back' : 'front';
  return (
    <div className={cx(styles.photo, styles[size], className)} aria-hidden="true">
      {showPhoto ? (
        <img src={src} alt="" loading="lazy" decoding="async" className={styles.img} onError={() => setFailed(src)} draggable={false} />
      ) : (
        <MuscleMap intensities={intensities} view={view} size={size === 'sm' ? 48 : size === 'md' ? 84 : 120} className={styles.fallbackMap} />
      )}
      {showPhoto && size !== 'sm' && (
        <span className={styles.mapBadge}>
          <MuscleMap intensities={intensities} view={view} size={size === 'lg' ? 56 : 44} />
        </span>
      )}
      {tag && <span className={cx(styles.tag, 'num')}>{tag}</span>}
    </div>
  );
}
