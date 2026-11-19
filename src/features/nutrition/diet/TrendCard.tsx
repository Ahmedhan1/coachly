import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { goalRate, suggestKcalChange, weightTrend, type DietGoal, type DietSettings } from '@/domain/meals';
import { t } from '@/i18n';
import { Button, Tx, TitleIcon } from '@/ui';
import common from '../shared/common.module.css';
import styles from './Cal.module.css';

interface Props {
  clientId: string;
  goal: DietGoal;
  ds: DietSettings;
  /** Called with the calorie change; the trainer taps to apply (never automatic). */
  onApply: (deltaKcal: number) => void;
}

const fmt = (n: number, d = 2) => {
  const v = Math.round(n * 10 ** d) / 10 ** d;
  return `${v > 0 ? '+' : ''}${v}`;
};

/** Weekly weight trend from the client's weigh-ins vs the goal pace, with a one-tap calorie suggestion. */
export function TrendCard({ clientId, goal, ds, onApply }: Props) {
  const repos = useRepos();
  const entries = useLive(() => repos.progress.listByClient(clientId), [repos, clientId]);
  const trend = useMemo(() => {
    const weighIns = (entries ?? []).flatMap((e) => (e.measurements.weightKg !== undefined ? [{ date: e.date, weightKg: e.measurements.weightKg }] : []));
    // Time comes in from the screen, never read inside the domain.
    return weightTrend(weighIns, new Date());
  }, [entries]);
  if (entries === undefined) return null;
  const rate = goalRate(goal, ds);
  const suggestion = trend ? suggestKcalChange(trend, goal, ds) : null;
  return (
    <div className={`${common.tile} ${styles.trend}`} aria-label={t('nutrition.cal.trendTitle')} role="group">
      <h2 className={common.sectionTitle}><TitleIcon name="trend" />{t('nutrition.cal.trendTitle')}</h2>
      {!trend ? (
        <>
          <p className={common.caption}>{t('nutrition.cal.trendNone')}</p>
          <Link to={`/clients/${clientId}/progress`} className={common.caption}>
            {t('nutrition.cal.addWeight')}
          </Link>
        </>
      ) : (
        <>
          <p className={common.caption}>
            <Tx k="nutrition.cal.trendRate" params={{ kg: fmt(trend.kgPerWeek), pct: fmt(trend.percentPerWeek) }} />
          </p>
          <p className={common.caption}>
            <Tx k="nutrition.cal.trendGoal" params={{ min: fmt(rate.min), max: fmt(rate.max) }} />
          </p>
          {suggestion ? (
            <div className={styles.suggest} role="status">
              <p>
                {t(`nutrition.cal.reason.${suggestion.reason}`, { weeks: suggestion.weeks })}{' '}
                {t(suggestion.deltaKcal < 0 ? 'nutrition.cal.suggestDown' : 'nutrition.cal.suggestUp', { kcal: Math.abs(suggestion.deltaKcal) })}
              </p>
              <Button icon="check" variant="secondary" onClick={() => onApply(suggestion.deltaKcal)}>
                {t('nutrition.cal.apply')}
              </Button>
            </div>
          ) : (
            <p className={common.caption}>{t('nutrition.cal.trendOk')}</p>
          )}
        </>
      )}
    </div>
  );
}
