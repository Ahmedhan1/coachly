import { memo } from 'react';
import { Link } from 'react-router-dom';
import { EQUIPMENT_LABELS_AR, muscleGroupLabelAr, type CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { cx } from '@/ui';
import { ExerciseThumb } from './ExerciseThumb';
import { StarIcon } from './icons';
import styles from './ExerciseRow.module.css';

export const ROW_HEIGHT = 84;

interface ExerciseRowProps {
  exercise: CatalogExercise;
  favourite: boolean;
  hidden: boolean;
  onToggleFavourite: (exercise: CatalogExercise) => void;
}

/** One library row: photo, Arabic name, primary muscle chip + equipment, favourite star. */
export const ExerciseRow = memo(function ExerciseRow({ exercise, favourite, hidden, onToggleFavourite }: ExerciseRowProps) {
  const primary = exercise.primaryMuscles[0];
  const name = exercise.nameAr;
  return (
    <div className={styles.row}>
      <Link to={`/exercises/${encodeURIComponent(exercise.id)}`} className={styles.main}>
        <ExerciseThumb exercise={exercise} />
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.meta}>
            {primary && <span className={styles.chip}>{muscleGroupLabelAr(primary)}</span>}
            {exercise.isCustom && <span className={cx(styles.chip, styles.brand)}>{t('training.library.custom')}</span>}
            {hidden && <span className={styles.chip}>{t('training.library.hidden')}</span>}
            <span className={styles.equipment}>{EQUIPMENT_LABELS_AR[exercise.equipment]}</span>
          </span>
        </span>
      </Link>
      <button
        type="button"
        className={cx(styles.star, favourite && styles.on)}
        aria-pressed={favourite}
        aria-label={t(favourite ? 'training.library.favouriteRemove' : 'training.library.favouriteAdd', { name })}
        onClick={() => onToggleFavourite(exercise)}
      >
        <StarIcon filled={favourite} />
      </button>
    </div>
  );
});
