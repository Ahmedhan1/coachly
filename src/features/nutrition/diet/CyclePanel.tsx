import type { CycleDayType, DietProfile, MacroTargets } from '@/domain/meals';
import { t } from '@/i18n';
import { Select, Tx } from '@/ui';
import styles from './Cal.module.css';
import diet from './Diet.module.css';

const EXTRA_STEP = 50;

interface Props {
  cycle: DietProfile['cycle'];
  extraKcal: number;
  types: readonly CycleDayType[];
  days: readonly MacroTargets[];
  averageKcal: number;
  targetKcal: number;
  onChange: (cycle: DietProfile['cycle']) => void;
}

/** Carb cycling: tap plan days to mark training, pick a refeed day, see each day's calories and the week's average. */
export function CyclePanel({ cycle, extraKcal, types, days, averageKcal, targetKcal, onChange }: Props) {
  const toggleDay = (i: number) => {
    const on = cycle.trainingDays.includes(i);
    onChange({ ...cycle, trainingDays: on ? cycle.trainingDays.filter((d) => d !== i) : [...cycle.trainingDays, i].sort((a, b) => a - b) });
  };
  return (
    <div className={styles.panel}>
      <label className={diet.check}>
        <input type="checkbox" checked={cycle.enabled} onChange={(e) => onChange({ ...cycle, enabled: e.target.checked })} />
        {t('nutrition.cal.cycleOn')}
      </label>
      <p className={diet.intro}>{t('nutrition.cal.cycleHint')}</p>
      {cycle.enabled && (
        <>
          <p className={styles.rowSub}>{t('nutrition.cal.trainingDays')}</p>
          <div className={styles.cycleDays}>
            {types.map((type, i) => (
              <button
                key={i}
                type="button"
                className={styles.cycleDay}
                data-type={type}
                aria-pressed={type === 'training'}
                aria-label={t('nutrition.cal.dayChipLabel', { n: i + 1, type: t(`nutrition.cal.dayType.${type}`) })}
                onClick={() => toggleDay(i)}
              >
                <span>{t('nutrition.cal.dayChip', { n: i + 1 })}</span>
                <small className="num">{Math.round(days[i]?.kcal ?? 0)}</small>
                <small>{t(`nutrition.cal.dayType.${type}`)}</small>
              </button>
            ))}
          </div>
          <Select
            label={t('nutrition.cal.refeed')}
            value={cycle.refeedDay === null ? 'none' : String(cycle.refeedDay)}
            onChange={(v) => onChange({ ...cycle, refeedDay: v === 'none' ? null : Number(v) })}
            options={[{ value: 'none', label: t('nutrition.cal.refeedNone') }, ...types.map((_, i) => ({ value: String(i), label: t('nutrition.cal.dayChip', { n: i + 1 }) }))]}
          />
          <div className={styles.row}>
            <div className={styles.rowHead}>
              <p className={styles.rowName}>{t('nutrition.cal.extraKcal')}</p>
            </div>
            <div className={styles.controls}>
              <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.less', { name: t('nutrition.cal.extraKcal') })} onClick={() => onChange({ ...cycle, extraKcal: Math.max(0, extraKcal - EXTRA_STEP) })}>
                −
              </button>
              <span className={`${styles.value} ${styles.shareValue} num`} aria-live="polite">
                {extraKcal}
              </span>
              <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.more', { name: t('nutrition.cal.extraKcal') })} onClick={() => onChange({ ...cycle, extraKcal: Math.min(1000, extraKcal + EXTRA_STEP) })}>
                +
              </button>
            </div>
          </div>
          <p className={styles.rowSub} role="status">
            <Tx k="nutrition.cal.weekAvg" params={{ kcal: Math.round(averageKcal), target: Math.round(targetKcal) }} />
          </p>
        </>
      )}
    </div>
  );
}
