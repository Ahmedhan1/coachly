import { useDeferredValue, useMemo, useState } from 'react';
import { MUSCLE_GROUPS, filterExercises, searchExercises, type CatalogExercise, type MuscleGroupId } from '@/domain/exercises';
import { t } from '@/i18n';
import { Num, SearchField, Sheet, Tx, cx } from '@/ui';
import { ExerciseThumb } from './ExerciseThumb';
import { exName, muscleName } from '@/features/exercises/localized';
import { exerciseSubline } from './names';
import styles from './Shared.module.css';

const LIMIT = 60;

export interface ExercisePickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: CatalogExercise) => void;
  exercises: readonly CatalogExercise[];
  favourites?: ReadonlySet<string>;
  title: string;
  /** Pre-selected muscle filter (e.g. the swapped exercise's main muscle). */
  initialMuscle?: MuscleGroupId | null;
}

type Filter = MuscleGroupId | 'all' | 'fav';

/** Search + muscle filter over the catalog; one tap picks an exercise. */
export function ExercisePickerSheet({ open, onClose, onPick, exercises, favourites, title, initialMuscle = null }: ExercisePickerSheetProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(initialMuscle ?? 'all');
  const deferred = useDeferredValue(query);
  const results = useMemo(() => {
    const base =
      filter === 'all'
        ? exercises
        : filter === 'fav'
          ? filterExercises(exercises, { favourites: favourites ?? new Set() })
          : filterExercises(exercises, { muscles: [filter] });
    return searchExercises(base, deferred);
  }, [exercises, favourites, filter, deferred]);

  const chips: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('training.programs.picker.all') },
    ...(favourites && favourites.size > 0 ? [{ value: 'fav' as const, label: t('training.programs.picker.favourites') }] : []),
    ...MUSCLE_GROUPS.map((g) => ({ value: g.id, label: muscleName(g.id) })),
  ];

  return (
    <Sheet open={open} onClose={onClose} title={title} cancelLabel={t('common.close')}>
      <div className={styles.pickerTop}>
        <SearchField
          value={query}
          onChange={setQuery}
          label={t('training.programs.picker.searchLabel')}
          placeholder={t('training.programs.picker.searchPlaceholder')}
          clearLabel={t('common.clearSearch')}
        />
        <div className={styles.chipRow} role="radiogroup" aria-label={t('training.programs.picker.muscleFilter')}>
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={filter === c.value}
              className={cx(styles.filterChip, filter === c.value && styles.filterChipOn)}
              onClick={() => setFilter(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className={styles.pickerCount} aria-live="polite">
          <Tx k="training.programs.picker.results" params={{ n: results.length }} />
        </p>
      </div>
      {results.length === 0 ? (
        <p className={styles.pickerEmpty}>{t('training.programs.picker.empty')}</p>
      ) : (
        <ul className={styles.pickerList}>
          {results.slice(0, LIMIT).map((e) => (
            <li key={e.id}>
              <button type="button" className={styles.pickerRow} onClick={() => onPick(e)} aria-label={t('training.programs.picker.add', { name: exName(e) })}>
                <ExerciseThumb exercise={e} size="sm" />
                <span className={styles.pickerText}>
                  <span className={styles.pickerName}>{exName(e)}</span>
                  <span className={styles.pickerSub}>{exerciseSubline(e)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length > LIMIT && (
        <p className={styles.pickerMore}>
          <Num>{LIMIT}</Num> / <Num>{results.length}</Num>
        </p>
      )}
    </Sheet>
  );
}
