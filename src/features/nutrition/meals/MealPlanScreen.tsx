import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { recipeIconHex, compareToTarget, dayTotals, duplicateMeals, nextDayNumber, scaleDayToTarget, type MacroTotals, type SavedCalculation } from '@/domain/meals';
import type { IngredientEntry } from '@/domain/meals';
import type { Client, Meal, MealPlan } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Button, EmptyState, Icon, PageHeader, TextArea } from '@/ui';
import { ClientNav } from '../shared/ClientNav';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { DayTotals } from './DayTotals';
import { MealCard } from './MealCard';
import { AddItemSheet, MealSheet, SwapSheet, type SheetState } from './MealSheets';
import { useRecipesWithNutrition } from './useRecipeLookup';
import { ShoppingSheet } from './PlanToolsSheets';
import { ClientPickerSheet } from '@/features/programs/ClientPickerSheet';
import common from '../shared/common.module.css';
import styles from './MealPlan.module.css';

const newId = () => crypto.randomUUID();
const dayNumberOf = (name: string): number | null => {
  const m = /\d+/.exec(name);
  return m ? Number(m[0]) : null;
};

export function MealPlanScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  const store = useNutritionStore();
  useStarterData();
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}`);
  const plans = useLive(async () => (await repos.mealPlans.listByClient(clientId)).sort((a, b) => a.createdAt - b.createdAt), [repos, clientId]);
  const saved = useLive(() => store.getCalculation(clientId), [store, clientId]);
  const settings = useLive(() => store.getSettings(), [store]);
  const recipes = useRecipesWithNutrition();
  const foods = useLive(() => store.getIngredients(), [store]);

  if (client === undefined || plans === undefined || saved === undefined || settings === undefined || recipes === undefined || foods === undefined) {
    return <PageHeader title="" back={{ to: back, label: t('common.back') }} />;
  }
  if (client === null) {
    return (
      <>
        <PageHeader title="" back={{ to: back, label: t('common.back') }} />
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  return <MealPlanView client={client} plans={plans} saved={saved} tolerance={settings.targetTolerancePercent} recipes={recipes} foods={foods} back={back} />;
}

interface ViewProps {
  client: Client;
  plans: MealPlan[];
  saved: SavedCalculation | null;
  tolerance: number;
  recipes: ReturnType<typeof useRecipesWithNutrition> & object;
  foods: IngredientEntry[];
  back: string;
}

function MealPlanView({ client, plans, saved, tolerance, recipes, foods, back }: ViewProps) {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [tool, setTool] = useState<null | 'shopping' | 'copyTo'>(null);
  const day = plans.find((p) => p.id === selectedId) ?? plans[0];
  const lookup = useMemo(() => new Map<string, MacroTotals>(recipes.map((r) => [r.recipe.id, r.perServing])), [recipes]);
  const images = useMemo(() => new Map(recipes.map((r) => [r.recipe.id, { imageId: r.recipe.imageId, icon: recipeIconHex(r.recipe.ingredients, foods) }])), [recipes, foods]);
  const names = useMemo(() => new Map(recipes.map((r) => [r.recipe.id, pick(r.recipe.name, r.recipe.nameEn)])), [recipes]);
  const target = saved?.targetKcal ?? day?.targetKcal ?? null;

  const defaultMeals = (): Meal[] =>
    (['breakfast', 'lunch', 'dinner'] as const).map((k) => ({ id: newId() as Meal['id'], name: t(`nutrition.plan.defaultMeals.${k}`), time: null, items: [] }));

  const addDay = async (meals: Meal[] = defaultMeals()) => {
    const n = nextDayNumber(plans.map((p) => dayNumberOf(p.name)));
    const created = await repos.mealPlans.create({ clientId: client.id, name: t('nutrition.plan.dayName', { n }), targetKcal: target === null ? null : Math.round(target), meals, notes: '' });
    setSelectedId(created.id);
    return created;
  };

  const updateMeals = (meals: Meal[]) => (day ? repos.mealPlans.update(day.id, { meals }) : Promise.resolve());

  const duplicateDay = async () => {
    if (!day) return;
    const copy = await addDay(duplicateMeals(day.meals, newId) as Meal[]);
    if (day.notes) await repos.mealPlans.update(copy.id, { notes: day.notes });
    showToast({ message: t('nutrition.plan.duplicated', { name: day.name }) });
  };

  const deleteDay = async () => {
    if (!day) return;
    const deleted = day;
    await repos.mealPlans.softDelete(deleted.id);
    setSelectedId(null);
    showToast({
      message: t('nutrition.plan.dayDeleted', { name: deleted.name }),
      actionLabel: t('common.undo'),
      onAction: () => void repos.mealPlans.restore(deleted.id).then(() => setSelectedId(deleted.id)),
      duration: 6000,
    });
  };

  const scaleDay = async () => {
    if (!day) return;
    if (!target) return showToast({ message: t('nutrition.tools.scaleNoTarget') });
    const before = day.meals;
    const r = scaleDayToTarget(day.meals, lookup, target);
    if (!r) return showToast({ message: t('nutrition.tools.scaleNothing') });
    await updateMeals(r.meals);
    showToast({
      message: t('nutrition.tools.scaled', { before: Math.round(r.beforeKcal), after: Math.round(r.afterKcal) }),
      actionLabel: t('common.undo'),
      onAction: () => void repos.mealPlans.update(day.id, { meals: before }),
      duration: 6000,
    });
  };

  const copyDayTo = async (other: Client) => {
    if (!day) return;
    const existing = await repos.mealPlans.listByClient(other.id);
    const n = nextDayNumber(existing.map((p) => dayNumberOf(p.name)));
    await repos.mealPlans.create({
      clientId: other.id,
      name: t('nutrition.plan.dayName', { n }),
      targetKcal: null,
      meals: duplicateMeals(day.meals, newId) as Meal[],
      notes: day.notes,
    });
    showToast({ message: t('nutrition.tools.copiedTo', { name: other.name }), duration: 3000 });
  };

  const removeMeal = async (meal: Meal) => {
    if (!day) return;
    const before = day.meals;
    await updateMeals(before.filter((m) => m.id !== meal.id));
    showToast({
      message: t('nutrition.plan.mealDeleted', { name: meal.name }),
      actionLabel: t('common.undo'),
      onAction: () => void repos.mealPlans.update(day.id, { meals: before }),
      duration: 6000,
    });
  };

  return (
    <div className={common.page}>
      <PageHeader title={t('nutrition.plan.title')} subtitle={client.name} back={{ to: back, label: t('common.back') }} />
      <ClientNav clientId={client.id} />

      {plans.length === 0 || !day ? (
        <div className={common.section}>
          <EmptyState
            icon="utensils"
            title={t('nutrition.plan.emptyTitle')}
            body={saved ? t('nutrition.plan.emptyBody') : t('nutrition.plan.emptyBodyNoTarget')}
            action={
              <>
                <Button icon="plus" onClick={() => void addDay()}>
                  {t('nutrition.plan.startFirstDay')}
                </Button>
                <Button variant="secondary" icon="target" onClick={() => navigate(`/clients/${client.id}/diet`, { replace: true })}>
                  {t('nutrition.diet.open')}
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <>
          <div className={styles.days} role="tablist" aria-label={t('nutrition.plan.days')}>
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === day.id}
                className={styles.dayPill}
                onClick={() => setSelectedId(p.id)}
              >
                {p.name}
              </button>
            ))}
            <button type="button" className={styles.addDay} onClick={() => void addDay()} aria-label={t('nutrition.plan.addDay')}>
              <Icon name="plus" />
            </button>
          </div>

          <section className={common.section} aria-label={t('nutrition.plan.totals')}>
            <DayTotals totals={dayTotals(day.meals, lookup)} comparison={compareToTarget(dayTotals(day.meals, lookup).totals.kcal, target, tolerance)} saved={saved} />
          </section>

          <div className={styles.meals}>
            {day.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                lookup={lookup}
                names={names}
                images={images}
                onAdd={() => setSheet({ kind: 'add', mealId: meal.id })}
                onSwap={(index) => setSheet({ kind: 'swap', mealId: meal.id, index })}
                onRemoveItem={(index) => void updateMeals(day.meals.map((m) => (m.id === meal.id ? { ...m, items: m.items.filter((_, i) => i !== index) } : m)))}
                onEdit={() => setSheet({ kind: 'meal', mealId: meal.id })}
                onDelete={() => void removeMeal(meal)}
              />
            ))}
          </div>

          <div className={common.actions}>
            <Button variant="secondary" icon="plus" onClick={() => setSheet({ kind: 'meal', mealId: null })}>
              {t('nutrition.plan.addMeal')}
            </Button>
            <Button variant="secondary" icon="copy" onClick={() => void duplicateDay()}>
              {t('nutrition.plan.duplicateDay')}
            </Button>
            <Button variant="secondary" icon="target" onClick={() => void scaleDay()}>
              {t('nutrition.tools.scale')}
            </Button>
            <Button variant="secondary" icon="target" onClick={() => navigate(`/clients/${client.id}/diet`, { replace: true })}>
              {t('nutrition.diet.open')}
            </Button>
            <Button variant="secondary" icon="list" onClick={() => setTool('shopping')}>
              {t('nutrition.tools.shopping')}
            </Button>
            <Button variant="secondary" icon="users" onClick={() => setTool('copyTo')}>
              {t('nutrition.tools.copyDay')}
            </Button>
          </div>
          {tool === 'shopping' && <ShoppingSheet client={client} plans={plans} recipes={recipes.map((r) => r.recipe)} onClose={() => setTool(null)} />}
          <ClientPickerSheet
            open={tool === 'copyTo'}
            title={t('nutrition.tools.copyDay')}
            excludeId={client.id}
            onClose={() => setTool(null)}
            onPick={(c) => {
              setTool(null);
              void copyDayTo(c);
            }}
          />

          <section className={common.section}>
            <div className={common.tile}>
              <TextArea
                key={day.id}
                label={t('nutrition.plan.notes')}
                defaultValue={day.notes}
                placeholder={t('nutrition.plan.notesPlaceholder')}
                onBlur={(e) => {
                  if (e.target.value !== day.notes) void repos.mealPlans.update(day.id, { notes: e.target.value });
                }}
              />
            </div>
          </section>

          <div className={styles.danger}>
            <Button variant="danger" icon="trash" onClick={() => void deleteDay()}>
              {t('nutrition.plan.deleteDay', { name: day.name })}
            </Button>
          </div>

          {sheet?.kind === 'add' && (
            <AddItemSheet
              recipes={recipes}
              onClose={() => setSheet(null)}
              onAdd={(item) => {
                void updateMeals(day.meals.map((m) => (m.id === sheet.mealId ? { ...m, items: [...m.items, item] } : m)));
                setSheet(null);
              }}
            />
          )}
          {sheet?.kind === 'swap' && (
            <SwapSheet
              recipes={recipes}
              meal={day.meals.find((m) => m.id === sheet.mealId)}
              index={sheet.index}
              lookup={lookup}
              onClose={() => setSheet(null)}
              onSwap={(meals) => {
                void updateMeals(meals(day.meals));
                setSheet(null);
              }}
            />
          )}
          {sheet?.kind === 'meal' && (
            <MealSheet
              meal={sheet.mealId ? day.meals.find((m) => m.id === sheet.mealId) : undefined}
              onClose={() => setSheet(null)}
              onSave={(name, time) => {
                const meals = sheet.mealId
                  ? day.meals.map((m) => (m.id === sheet.mealId ? { ...m, name, time } : m))
                  : [...day.meals, { id: newId() as Meal['id'], name, time, items: [] }];
                void updateMeals(meals);
                setSheet(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
