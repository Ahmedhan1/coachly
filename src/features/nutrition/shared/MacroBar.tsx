import { macroShares } from '@/domain/meals';
import { t } from '@/i18n';
import { Num } from '@/ui';
import { gramsText, kcalText } from './numbers';
import styles from './MacroBar.module.css';

interface MacroBarProps {
  proteinG: number;
  carbG: number;
  fatG: number;
  proteinKcal: number;
  carbKcal: number;
  fatKcal: number;
  /** Compact = bar + grams only (recipe rows). */
  compact?: boolean;
}

/** Proportional bar of where the calories come from, with grams and kcal named under it (never color alone). */
export function MacroBar({ proteinG, carbG, fatG, proteinKcal, carbKcal, fatKcal, compact }: MacroBarProps) {
  const share = macroShares({ proteinKcal, carbKcal, fatKcal });
  const parts = [
    { key: 'protein', label: t('nutrition.macros.protein'), grams: proteinG, kcal: proteinKcal, share: share.protein },
    { key: 'carb', label: t('nutrition.macros.carb'), grams: carbG, kcal: carbKcal, share: share.carb },
    { key: 'fat', label: t('nutrition.macros.fat'), grams: fatG, kcal: fatKcal, share: share.fat },
  ] as const;
  return (
    <div className={styles.wrap}>
      <div className={styles.bar} aria-hidden="true">
        {parts.map((p) =>
          p.share > 0 ? <span key={p.key} className={styles[p.key]} style={{ flexGrow: p.share }} /> : null,
        )}
      </div>
      <dl className={compact ? styles.legendCompact : styles.legend}>
        {parts.map((p) => (
          <div key={p.key}>
            <dt>
              <span className={`${styles.swatch} ${styles[p.key]}`} aria-hidden="true" />
              {p.label}
            </dt>
            <dd>
              <Num>{gramsText(p.grams)}</Num>
              <span className={styles.unit}>{t('nutrition.units.g')}</span>
            </dd>
            {!compact && (
              <dd className={styles.kcal}>
                <Num>{kcalText(p.kcal)}</Num> {t('nutrition.units.kcal')} · <Num>{Math.round(p.share * 100)}</Num>%
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
