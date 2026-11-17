import { exerciseHistory } from '@/domain/clientHub';
import type { WorkoutLog } from '@/domain/models';
import { kgToUnit } from '@/domain/programs';
import { t } from '@/i18n';
import { Button, LineChart, Num, Sheet, Tx, cx } from '@/ui';
import { formatIsoDate, formatNumber } from '@/ui/format';
import styles from './Hub.module.css';

export interface ExerciseHistorySheetProps {
  exerciseId: string;
  name: string;
  logs: readonly WorkoutLog[];
  unit: 'kg' | 'lb';
  onClose: () => void;
  onOpenDetail: () => void;
}

/** One client's history of one exercise: best 1RM and weight, the 1RM trend, and every session's sets. */
export function ExerciseHistorySheet({ exerciseId, name, logs, unit, onClose, onOpenDetail }: ExerciseHistorySheetProps) {
  const h = exerciseHistory(logs, exerciseId);
  const unitLabel = t(`training.session.units.${unit}`);
  const shown = (kg: number) => formatNumber(Math.round(kgToUnit(kg, unit) * 10) / 10);
  return (
    <Sheet open onClose={onClose} title={name} cancelLabel={t('common.close')}>
      {h.entries.length === 0 ? (
        <p className={styles.emptyBody}>{t('hub.training.historyEmpty')}</p>
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>{t('hub.exercise.best1rm')}</dt>
              <dd>
                <Num>{shown(h.bestE1rm)}</Num>
                <small>{unitLabel}</small>
              </dd>
            </div>
            <div>
              <dt>{t('hub.exercise.bestWeight')}</dt>
              <dd>
                <Num>{shown(h.bestWeightKg)}</Num>
                <small>{unitLabel}</small>
              </dd>
            </div>
          </dl>
          {h.series.length >= 2 && (
            <LineChart
              series={h.series.map((p) => ({ date: p.date, value: kgToUnit(p.value, unit) }))}
              label={t('hub.exercise.chart')}
              formatValue={(v) => `${formatNumber(Math.round(v))} ${unitLabel}`}
              formatDate={formatIsoDate}
              dateHeader={t('hub.exercise.date')}
              valueHeader={t('hub.exercise.best1rm')}
              height={160}
            />
          )}
          <ol className={styles.entries} aria-label={t('hub.exercise.sessions')}>
            {h.entries.map((e) => (
              <li key={e.logId} className={styles.entry}>
                <p className={styles.entryHead}>
                  <span>{formatIsoDate(e.date)}</span>
                  {e.volumeKg > 0 && (
                    <span className={styles.delta}>
                      <Tx k="hub.exercise.volume" params={{ n: `${shown(e.volumeKg)} ${unitLabel}` }} />
                    </span>
                  )}
                </p>
                <p className={styles.entrySets}>
                  {e.sets.map((s, i) => (
                    <span key={i} className={cx(styles.setChip, s.weightKg === e.best.weightKg && s.reps === e.best.reps && styles.bestChip)}>
                      <Num>{`${kgToUnit(s.weightKg, unit)}×${s.reps}`}</Num>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      <Button block variant="secondary" icon="dumbbell" onClick={onOpenDetail}>
        {t('hub.exercise.openDetail')}
      </Button>
    </Sheet>
  );
}
