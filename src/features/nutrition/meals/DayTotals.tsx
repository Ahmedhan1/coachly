import type { MacroTotals, SavedCalculation, TargetComparison } from '@/domain/meals';
import { t } from '@/i18n';
import { Badge, Num } from '@/ui';
import { gramsText, kcalText } from '../shared/numbers';
import styles from './MealPlan.module.css';

interface DayTotalsProps {
  totals: { totals: MacroTotals; uncounted: number };
  comparison: TargetComparison;
  saved: SavedCalculation | null;
}

/** The day's calories against the calculator target, plus grams of each macro against their targets. */
export function DayTotals({ totals, comparison, saved }: DayTotalsProps) {
  const { kcal, proteinG, carbG, fatG } = totals.totals;
  const status = comparison.status;
  const tone = status === 'on' ? 'ok' : status === 'no_target' ? 'neutral' : 'warning';
  const fill = Math.min(1, comparison.ratio);
  const macros = [
    { key: 'protein', value: proteinG, target: saved?.proteinG },
    { key: 'carb', value: carbG, target: saved?.carbG },
    { key: 'fat', value: fatG, target: saved?.fatG },
  ] as const;
  return (
    <div className={styles.totals} data-testid="day-totals">
      <div className={styles.totalsHead}>
        <p className={styles.totalsKcal}>
          <Num>{kcalText(kcal)}</Num>
          {saved && (
            <span className={styles.totalsTarget}>
              / <Num>{kcalText(saved.targetKcal)}</Num>
            </span>
          )}
          <span className={styles.unit}>{t('nutrition.units.kcal')}</span>
        </p>
        <Badge tone={tone}>
          {status === 'no_target'
            ? t('nutrition.plan.status.no_target')
            : t(`nutrition.plan.status.${status}`, { kcal: kcalText(Math.abs(comparison.diffKcal)) })}
        </Badge>
      </div>
      {status !== 'no_target' && (
        <div
          className={styles.meter}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={saved?.targetKcal ?? 0}
          aria-valuenow={Math.round(kcal)}
          aria-label={t('nutrition.plan.meterLabel')}
        >
          <span style={{ inlineSize: `${fill * 100}%` }} data-over={status === 'over' || undefined} />
        </div>
      )}
      <dl className={styles.macroTargets}>
        {macros.map((m) => (
          <div key={m.key}>
            <dt>{t(`nutrition.macros.${m.key}`)}</dt>
            <dd>
              <Num>{gramsText(m.value)}</Num>
              {m.target !== undefined && (
                <span className={styles.of}>
                  {' / '}
                  <Num>{gramsText(m.target)}</Num>
                </span>
              )}
              <span className={styles.unit}>{t('nutrition.units.g')}</span>
            </dd>
          </div>
        ))}
      </dl>
      {totals.uncounted > 0 && <p className={styles.uncounted}>{t('nutrition.plan.uncounted', { n: totals.uncounted })}</p>}
      {status === 'no_target' && <p className={styles.uncounted}>{t('nutrition.plan.noTargetHint')}</p>}
    </div>
  );
}
