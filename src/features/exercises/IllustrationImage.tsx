import type { CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { exName } from './localized';
import { MuscleFallback } from './MuscleFallback';
import { useExerciseIllustration } from './useExerciseIllustration';
import styles from './ExerciseThumb.module.css';

interface Props {
  exercise: CatalogExercise;
  /** Size of the 2D muscle map shown while the picture is drawn, or when the device cannot draw it. */
  fallbackSize: number;
}

/** Muscle-target picture from our own 3D model; the flat SVG muscle map shows until it is ready. */
export function IllustrationImage({ exercise, fallbackSize }: Props) {
  const url = useExerciseIllustration(exercise);
  if (url === null) return <MuscleFallback exercise={exercise} size={fallbackSize} />;
  return (
    <img
      src={url}
      alt={t('exercises.detail.illustrationAlt', { name: exName(exercise) })}
      decoding="async"
      className={styles.illustration}
    />
  );
}
