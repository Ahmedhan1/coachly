import { useMemo } from 'react';
import { useRepos, useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { applyMealPicks, effectivePicks, mealPicksKey, parseMealPicks } from '@/domain/meals';
import type { Client, MealPlan } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Button, TitleIcon } from '@/ui';
import type { RecipeWithNutrition } from './useRecipeLookup';
import common from '../shared/common.module.css';

/**
 * «العميل اختار: …» — the meal options the client picked on his page (sent with his check-in). One tap puts
 * them into the saved plan (the old meal stays as an option); nothing changes until the trainer taps.
 */
export function ClientPicksCard({ client, plans, recipes }: { client: Client; plans: MealPlan[]; recipes: readonly RecipeWithNutrition[] }) {
  const { meta } = useServices();
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const stored = useLive(async () => parseMealPicks(await meta.get(mealPicksKey(client.id))), [meta, client.id]);
  const names = useMemo(() => new Map(recipes.map((r) => [r.recipe.id as string, pick(r.recipe.name, r.recipe.nameEn)])), [recipes]);
  if (!stored) return null;
  const picks = effectivePicks(plans, stored.picks);
  if (picks.length === 0) return null;
  const food = (items: MealPlan['meals'][number]['items']) =>
    items
      .map((i) => (i.recipeId ? (names.get(i.recipeId) ?? '') : i.text))
      .filter(Boolean)
      .join(' + ');
  const clear = () => meta.set(mealPicksKey(client.id), null);
  const apply = async () => {
    const changed = applyMealPicks(plans, stored.picks);
    for (const p of changed) await repos.mealPlans.update(p.id, { meals: p.meals });
    await clear();
    showToast({ message: t('nutrition.goal.picksApplied', { name: client.name, n: picks.length }), duration: 3000 });
  };
  return (
    <section className={common.section} aria-label={t('nutrition.goal.picksTitle')}>
      <div className={common.tile}>
        <h2 className={common.sectionTitle}><TitleIcon name="checklist" />{t('nutrition.goal.picksTitle')}</h2>
        <ul className={common.caption}>
          {picks.map((p) => (
            <li key={`${p.planId}-${p.mealName}-${p.o}`}>{t('nutrition.goal.picksLine', { day: p.planName, meal: p.mealName, food: food(p.items) })}</li>
          ))}
        </ul>
        <div className={common.actions}>
          <Button icon="check" onClick={() => void apply()}>
            {t('nutrition.goal.picksApply')}
          </Button>
          <Button variant="secondary" onClick={() => void clear()}>
            {t('nutrition.goal.picksDismiss')}
          </Button>
        </div>
      </div>
    </section>
  );
}
