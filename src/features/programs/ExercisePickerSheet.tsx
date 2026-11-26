import { useDeferredValue, useMemo, useState } from 'react';
import { MUSCLE_GROUPS, filterExercises, searchExercises, type CatalogExercise, type MuscleGroupId } from '@/domain/exercises';
import { assessExercise, rankForClient, saferAlternatives, type ExerciseFit, type FitProfile } from '@/domain/exercises/fit';
import { t } from '@/i18n';
import { Num, SearchField, Sheet, Tx, cx } from '@/ui';
import { ExerciseThumb } from './ExerciseThumb';
import { exName, muscleName } from '@/i18n/exerciseNames';
import { exerciseSubline } from '@/i18n/programNames';
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
  /** The client the program is for: adds «مناسب لـ …» (default), injury warnings with safer options, hides avoided. */
  tailor?: { name: string; profile: FitProfile } | null;
}

type Filter = MuscleGroupId | 'all' | 'fav' | 'fit';

/** Search + muscle filter over the catalog; one tap picks an exercise. */
export function ExercisePickerSheet({ open, onClose, onPick, exercises, favourites, title, initialMuscle = null, tailor = null }: ExercisePickerSheetProps) {
  const [query, setQuery] = useState('');
  // The client may load after the sheet mounts: until the trainer picks a chip, the default follows it.
  const [chosen, setFilter] = useState<Filter | null>(null);
  const filter: Filter = chosen ?? initialMuscle ?? (tailor ? 'fit' : 'all');
  const [saferFor, setSaferFor] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const profile = tailor?.profile ?? null;
  // Avoided exercises never show for this client; the fit list also leaves out what needs missing
  // equipment or loads an injured joint hard.
  const visible = useMemo(() => {
    if (!profile) return exercises;
    const avoid = new Set(profile.avoidIds ?? []);
    return exercises.filter((e) => !avoid.has(e.id));
  }, [exercises, profile]);
  const fitList = useMemo(
    () => (profile ? rankForClient(exercises, profile).filter((r) => !r.fit.risks.some((x) => x.stress === 'high')).map((r) => r.exercise) : []),
    [exercises, profile],
  );
  const results = useMemo(() => {
    const base =
      filter === 'all'
        ? visible
        : filter === 'fit'
          ? fitList
          : filter === 'fav'
            ? filterExercises(visible, { favourites: favourites ?? new Set() })
            : filterExercises(visible, { muscles: [filter] });
    return searchExercises(base, deferred);
  }, [visible, fitList, favourites, filter, deferred]);
  const fitOf = (e: CatalogExercise): ExerciseFit | null => (profile ? assessExercise(e, profile) : null);
  const firstName = tailor?.name.split(/\s+/)[0] ?? '';

  const chips: Array<{ value: Filter; label: string }> = [
    ...(tailor ? [{ value: 'fit' as const, label: t('hub.tailor.fit.chip', { name: firstName }) }] : []),
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
          {filter === 'fit' && exercises.length > fitList.length && <> · {t('hub.tailor.fit.hidden', { n: exercises.length - fitList.length, name: firstName })}</>}
        </p>
      </div>
      {results.length === 0 ? (
        <p className={styles.pickerEmpty}>{t('training.programs.picker.empty')}</p>
      ) : (
        <ul className={styles.pickerList}>
          {results.slice(0, LIMIT).map((e) => {
            const fit = fitOf(e);
            const risk = fit?.risks[0];
            const safer = profile && saferFor === e.id ? saferAlternatives(e, exercises, profile, 4) : null;
            return (
              <li key={e.id}>
                <button type="button" className={styles.pickerRow} onClick={() => onPick(e)} aria-label={t('training.programs.picker.add', { name: exName(e) })}>
                  <ExerciseThumb exercise={e} size="sm" />
                  <span className={styles.pickerText}>
                    <span className={styles.pickerName}>{exName(e)}</span>
                    <span className={styles.pickerSub}>
                      {exerciseSubline(e)}
                      {fit?.favourite && <span className={styles.fitFav}> · {t('hub.tailor.fit.favourite')}</span>}
                      {fit && !fit.available && <span className={styles.fitWarn}> · {t('hub.tailor.fit.noEquipment')}</span>}
                    </span>
                    {risk && (
                      <span className={cx(styles.fitBadge, risk.stress === 'high' && styles.fitBadgeHigh)} data-testid="fit-warning">
                        {t('hub.tailor.fit.warn', { joint: fit.risks.map((r) => t(`hub.tailor.joints.${r.joint}`)).join(' · ') })}
                      </span>
                    )}
                  </span>
                </button>
                {risk && (
                  <div className={styles.saferBar}>
                    <button type="button" className={styles.saferToggle} aria-expanded={saferFor === e.id} onClick={() => setSaferFor(saferFor === e.id ? null : e.id)}>
                      {t('hub.tailor.fit.safer')}
                    </button>
                    {safer && (
                      safer.length === 0 ? (
                        <p className={styles.pickerEmpty}>{t('hub.tailor.fit.noSafer')}</p>
                      ) : (
                        <ul className={styles.saferList} aria-label={t('hub.tailor.fit.saferTitle', { name: exName(e) })}>
                          {safer.map((alt) => (
                            <li key={alt.id}>
                              <button type="button" className={styles.saferRow} onClick={() => onPick(alt)} aria-label={t('training.programs.picker.add', { name: exName(alt) })}>
                                <ExerciseThumb exercise={alt} size="sm" />
                                <span className={styles.pickerText}>
                                  <span className={styles.pickerName}>{exName(alt)}</span>
                                  <span className={styles.pickerSub}>{exerciseSubline(alt)}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
