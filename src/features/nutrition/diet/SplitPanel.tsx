import { SPLIT_PRESETS, setShare, workoutRoles, type DietSlot, type SplitPreset } from '@/domain/meals';
import { t } from '@/i18n';
import { Chip, Tx } from '@/ui';
import styles from './Cal.module.css';
import diet from './Diet.module.css';

const SHARE_STEP = 5;

interface Props {
  /** The layout as planned (shares already applied). */
  slots: readonly DietSlot[];
  kcal: number;
  preset: SplitPreset | 'custom';
  workoutTime: string | null;
  onPreset: (p: SplitPreset) => void;
  onShares: (shares: number[]) => void;
  onWorkout: (time: string | null) => void;
}

/** Calories per meal: presets, a training time that moves carbs around it, and − / + per meal keeping 100 %. */
export function SplitPanel({ slots, kcal, preset, workoutTime, onPreset, onShares, onWorkout }: Props) {
  const shares = slots.map((s) => s.sharePercent);
  const roles = workoutRoles(slots, workoutTime);
  const total = shares.reduce((a, b) => a + b, 0);
  const move = (i: number, d: number) => onShares(setShare(shares, i, (shares[i] ?? 0) + d));
  return (
    <div className={styles.panel}>
      <p className={styles.rowSub}>{t('nutrition.cal.splitHint')}</p>
      <div className={styles.chips} role="group" aria-label={t('nutrition.cal.presetTitle')}>
        {[...SPLIT_PRESETS, 'custom' as const].map((p) => (
          <Chip
            key={p}
            pressed={p === preset}
            disabled={p === 'custom'}
            onClick={() => p !== 'custom' && onPreset(p)}
          >
            {t(`nutrition.cal.preset.${p}`)}
          </Chip>
        ))}
      </div>
      <label className={diet.check}>
        <input type="checkbox" checked={workoutTime !== null} onChange={(e) => onWorkout(e.target.checked ? '17:00' : null)} />
        {t('nutrition.cal.workoutOn')}
      </label>
      {workoutTime !== null && (
        <>
          <label className={styles.controls}>
            <span className={styles.rowSub}>{t('nutrition.cal.workoutTime')}</span>
            <input
              type="time"
              className={`${styles.time} num`}
              value={workoutTime}
              step={900}
              onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && onWorkout(e.target.value)}
            />
          </label>
          <p className={styles.rowSub}>{t('nutrition.cal.workoutHint')}</p>
        </>
      )}
      <div>
        {slots.map((s, i) => {
          const name = t(`nutrition.diet.slot.${s.label}`);
          const role = roles[i] ?? null;
          return (
            <div key={i} className={styles.row}>
              <div className={styles.rowHead}>
                <p className={styles.rowName}>
                  {name} <bdi className={`${styles.rowSub} num`}>{s.time}</bdi>
                </p>
                <p className={styles.rowSub}>
                  <Tx k="nutrition.cal.slotShare" params={{ share: s.sharePercent, kcal: Math.round((kcal * s.sharePercent) / 100) }} />
                  {role && (
                    <>
                      {' '}
                      <span className={styles.tag}>{t(`nutrition.cal.${role}`)}</span>
                    </>
                  )}
                </p>
              </div>
              <div className={styles.controls}>
                <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.shareLess', { name })} onClick={() => move(i, -SHARE_STEP)}>
                  −
                </button>
                <span className={`${styles.value} ${styles.shareValue} num`} aria-live="polite">
                  {s.sharePercent}%
                </span>
                <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.shareMore', { name })} onClick={() => move(i, SHARE_STEP)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        <p className={styles.total}>{t('nutrition.cal.splitTotal', { n: total })}</p>
      </div>
    </div>
  );
}
