import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, Icon, ListRow, ListSection, Num, Tx } from '@/ui';
import { formatNumber } from '@/ui/format';
import { useNutritionStore } from '@/features/nutrition/shared/useNutritionStore';
import styles from './Hub.module.css';

/** Nutrition at a glance: saved targets, the meal plan days, supplements — each opens its editor for this client. */
export function NutritionTab({ client, go }: { client: Client; go: (to: string) => void }) {
  const repos = useRepos();
  const store = useNutritionStore();
  const calc = useLive(() => store.getCalculation(client.id), [store, client.id]);
  const plans = useLive(async () => (await repos.mealPlans.listByClient(client.id)).sort((a, b) => a.createdAt - b.createdAt), [repos, client.id]);
  const supplements = useLive(async () => {
    const [assigned, catalog] = await Promise.all([store.getClientSupplements(client.id), repos.supplements.list()]);
    const names = new Map<string, string>(catalog.map((s) => [s.id, s.name]));
    return assigned.map((a) => names.get(a.supplementId)).filter((n): n is string => Boolean(n));
  }, [store, repos, client.id]);
  const base = `/clients/${client.id}`;

  return (
    <>
      <ListSection title={t('hub.nutrition.targets')}>
        {calc ? (
          <button type="button" className={styles.targets} onClick={() => go(`${base}/nutrition`)}>
            <p className={styles.kcal}>
              <Num>{formatNumber(calc.targetKcal)}</Num>
              <small>{t('hub.nutrition.kcal')}</small>
            </p>
            <dl className={styles.macros}>
              {(
                [
                  ['protein', calc.proteinG],
                  ['carbs', calc.carbG],
                  ['fat', calc.fatG],
                ] as const
              ).map(([key, grams]) => (
                <div key={key}>
                  <dt>{t(`hub.nutrition.${key}`)}</dt>
                  <dd>
                    <Num>{formatNumber(grams)}</Num>
                    <small>{t('hub.nutrition.grams')}</small>
                  </dd>
                </div>
              ))}
              <div>
                <dt>{t('hub.nutrition.water')}</dt>
                <dd>
                  <Num>{`${formatNumber(Math.round(calc.waterMinMl / 100) / 10)}–${formatNumber(Math.round(calc.waterMaxMl / 100) / 10)}`}</Num>
                  <small>{t('hub.nutrition.liters')}</small>
                </dd>
              </div>
            </dl>
          </button>
        ) : (
          <div className={styles.emptyTile}>
            <p className={styles.emptyTitle}>{t('hub.nutrition.noTargets')}</p>
            <p className={styles.emptyBody}>{t('hub.nutrition.noTargetsBody')}</p>
            {calc === null && (
              <Button icon="utensils" onClick={() => go(`${base}/nutrition`)}>
                {t('hub.nutrition.calculator')}
              </Button>
            )}
          </div>
        )}
      </ListSection>

      <ListSection title={t('hub.nutrition.plans')} count={plans?.length || undefined}>
        {plans && plans.length === 0 && <ListRow leading={<Icon name="note" />} title={t('hub.nutrition.noPlans')} to={`${base}/meals`} />}
        {plans?.map((plan) => (
          <ListRow
            key={plan.id}
            leading={<Icon name="note" />}
            title={plan.name}
            subtitle={
              <>
                <Tx k="hub.nutrition.planMeals" params={{ n: plan.meals.length }} />
                {plan.targetKcal !== null && (
                  <>
                    {' · '}
                    <Tx k="hub.nutrition.planKcal" params={{ n: plan.targetKcal }} />
                  </>
                )}
              </>
            }
            to={`${base}/meals`}
          />
        ))}
      </ListSection>

      <ListSection title={t('hub.nutrition.supplements')} count={supplements?.length || undefined}>
        <ListRow
          leading={<Icon name="pill" />}
          title={supplements && supplements.length > 0 ? supplements.join('، ') : t('hub.nutrition.noSupplements')}
          to={`${base}/supplements`}
        />
      </ListSection>

      <ListSection label={t('hub.tabs.nutrition')}>
        <ListRow leading={<Icon name="utensils" />} title={t('hub.nutrition.calculator')} to={`${base}/nutrition`} />
        <ListRow leading={<Icon name="list" />} title={t('hub.nutrition.recipes')} to="/more/recipes" />
      </ListSection>
    </>
  );
}
