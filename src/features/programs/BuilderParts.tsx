import type { CatalogExercise } from '@/domain/exercises';
import { muscleName } from '@/features/exercises/localized';
import { dayLabel } from './names';
import type { ProgramDay } from '@/domain/models';
import { dayMuscleLoad, estimateDayMinutes, totalSets, weeklySetsPerMuscle, type ProgramBody } from '@/domain/programs';
import { t } from '@/i18n';
import { Icon, Num, Tx, cx, TitleIcon } from '@/ui';
import { MuscleMap, intensitiesFromLoad } from '@/ui/MuscleMap';
import styles from './Builder.module.css';

export function DayPills({
  days,
  selectedId,
  onSelect,
  onAdd,
}: {
  days: readonly ProgramDay[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <nav className={styles.pills} aria-label={t('training.programs.builder.daysLabel')}>
      {days.map((d, i) => (
        <button
          key={d.id}
          type="button"
          className={styles.pill}
          aria-current={d.id === selectedId ? 'true' : undefined}
          onClick={() => onSelect(d.id)}
        >
          <b className="num">{i + 1}</b>
          {dayLabel(d.name) || t('training.programs.builder.dayDefault', { n: i + 1 })}
        </button>
      ))}
      {days.length < 14 && (
        <button type="button" className={cx(styles.pill, styles.pillAdd)} aria-label={t('training.programs.builder.addDay')} onClick={onAdd}>
          <Icon name="plus" />
        </button>
      )}
    </nav>
  );
}

export function DayTile({ day, index, catalog }: { day: ProgramDay; index: number; catalog: ReadonlyMap<string, CatalogExercise> }) {
  const load = dayMuscleLoad(day, catalog);
  const primary = load.filter((m) => m.role === 'primary');
  const secondary = load.filter((m) => m.role === 'secondary').slice(0, 2);
  return (
    <section className={styles.dayTile} aria-label={t('training.programs.builder.muscles')}>
      <div className={styles.dayText}>
        <h2 className={styles.dayName}>{dayLabel(day.name) || t('training.programs.builder.dayDefault', { n: index + 1 })}</h2>
        <p className={styles.dayStats}>
          <Tx
            k="training.programs.builder.dayStats"
            params={{ exercises: day.items.length, sets: totalSets(day), minutes: estimateDayMinutes(day) }}
          />
        </p>
        {load.length > 0 && (
          <ul className={styles.muscleChips}>
            {primary.slice(0, 3).map((m) => (
              <li key={m.muscle} className={cx(styles.mChip, styles.mChipBrand)}>
                {muscleName(m.muscle)}
              </li>
            ))}
            {secondary.map((m) => (
              <li key={m.muscle} className={styles.mChip}>
                {muscleName(m.muscle)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <MuscleMap intensities={intensitiesFromLoad(load)} size={92} className={styles.dayMap} label={t('training.programs.builder.muscles')} />
    </section>
  );
}

export function WeekSummary({ body, catalog }: { body: ProgramBody; catalog: ReadonlyMap<string, CatalogExercise> }) {
  const rows = weeklySetsPerMuscle(body, catalog).filter((r) => r.direct > 0);
  const max = Math.max(1, ...rows.map((r) => r.direct));
  return (
    <section className={styles.week} aria-labelledby="week-title">
      <h2 id="week-title" className={styles.weekTitle}><TitleIcon name="calendar" />
        {t('training.programs.builder.week')}
      </h2>
      <p className={styles.weekHint}>{t('training.programs.builder.weekHint')}</p>
      {rows.length === 0 ? (
        <p className={styles.weekHint}>{t('training.programs.builder.weekEmpty')}</p>
      ) : (
        <ul className={styles.weekList}>
          {rows.map((r) => (
            <li key={r.muscle} className={styles.weekRow}>
              <span className={styles.weekName}>{muscleName(r.muscle)}</span>
              <span className={styles.weekBar} aria-hidden="true">
                <i style={{ inlineSize: `${Math.round((r.direct / max) * 100)}%` }} />
              </span>
              <span className={styles.weekValue}>
                <Tx k="training.programs.builder.weekSets" params={{ n: r.direct }} />
                {r.indirect > 0 && (
                  <small>
                    {' '}
                    <Tx k="training.programs.builder.weekIndirect" params={{ n: <Num>{r.indirect}</Num> }} />
                  </small>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
