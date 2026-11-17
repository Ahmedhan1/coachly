import { useMemo, useState } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import {
  nextDayNumber,
  recipeIconHex,
  recomputeDay,
  slotAlternatives,
  type DietDay,
  type DietGoal,
  type DietItem,
  type DietMeal,
  type DietRecipe,
  type DietSettings,
  type DietStyle,
  type MacroTargets,
} from '@/domain/meals';
import type { Client, Meal } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, Num, Sheet } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import { kcalText } from '../shared/numbers';
import { useNutritionStore } from '../shared/useNutritionStore';
import type { RecipeWithNutrition } from '../meals/useRecipeLookup';
import common from '../shared/common.module.css';
import plan from '../meals/MealPlan.module.css';
import styles from './Diet.module.css';

interface Props {
  client: Client;
  week: DietDay[];
  book: DietRecipe[];
  recipes: RecipeWithNutrition[];
  targets: MacroTargets;
  goal: DietGoal;
  style: DietStyle;
  vegetarian: boolean;
  ds: DietSettings;
  noteKeys: string[];
  onSaved: () => void;
}

const newId = () => crypto.randomUUID();
const whole = (n: number) => String(Math.round(n));

/** The generated week: per-day totals and checks, a swap per main dish, the nutritionist notes, and save. */
export function DietWeek({ client, week, book, recipes, targets, goal, style, vegetarian, ds, noteKeys, onSaved }: Props) {
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const foods = useLive(() => store.getIngredients(), [store]);
  const [selected, setSelected] = useState(0);
  const [edit, setEdit] = useState<{ week: DietDay[]; days: Map<number, DietDay> }>({ week, days: new Map() });
  const [swapping, setSwapping] = useState<{ day: number; meal: number } | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const existing = useLive(() => repos.mealPlans.listByClient(client.id), [repos, client.id]);

  const edits = edit.week === week ? edit.days : new Map<number, DietDay>();
  const days = week.map((d, i) => edits.get(i) ?? d);
  const day = days[selected] ?? days[0];
  const byId = useMemo(() => new Map(recipes.map((r) => [r.recipe.id as string, r.recipe])), [recipes]);
  const iconOf = (id: string) => {
    const r = byId.get(id);
    return r ? { imageId: r.imageId, icon: recipeIconHex(r.ingredients, foods ?? []) } : { imageId: null, icon: undefined };
  };
  if (!day) return null;

  const swapIn = (dayIndex: number, mealIndex: number, item: DietItem) => {
    const current = days[dayIndex];
    if (!current) return;
    const mealsNext = current.meals.map((m, i) => (i === mealIndex ? { slot: m.slot, items: [item, ...m.items.slice(1)] } : { slot: m.slot, items: m.items }));
    const next = recomputeDay(mealsNext, book, targets, ds);
    setEdit({ week, days: new Map(edits).set(dayIndex, next) });
    setSwapping(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const old = replace ? (existing ?? []) : [];
      for (const p of old) await repos.mealPlans.softDelete(p.id);
      let n = nextDayNumber(replace ? [] : (existing ?? []).map((p) => (/\d+/.exec(p.name) ? Number(/\d+/.exec(p.name)?.[0]) : null)));
      const created: string[] = [];
      const notes = noteKeys.map((k) => `• ${t(`nutrition.diet.notes.${k}` as 'nutrition.diet.notes.water')}`).join('\n');
      for (const [index, d] of days.entries()) {
        const meals: Meal[] = d.meals.map((m: DietMeal) => ({
          id: newId() as Meal['id'],
          name: t(`nutrition.diet.slot.${m.slot.label}`),
          time: m.slot.time as Meal['time'],
          items: m.items.map((i) => ({ recipeId: i.recipeId as Meal['items'][number]['recipeId'], text: '', servings: i.servings })),
        }));
        const plan = await repos.mealPlans.create({
          clientId: client.id,
          name: t('nutrition.plan.dayName', { n: n++ }),
          targetKcal: Math.round(targets.kcal),
          meals,
          notes: index === 0 ? notes : '',
        });
        created.push(plan.id);
      }
      showToast({
        message: t('nutrition.diet.saved', { n: created.length, name: client.name }),
        actionLabel: t('nutrition.diet.saveUndo'),
        onAction: () => void Promise.all([...created.map((id) => repos.mealPlans.softDelete(id)), ...old.map((p) => repos.mealPlans.restore(p.id))]),
        duration: 8000,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const swapMeal = swapping ? days[swapping.day]?.meals[swapping.meal] : undefined;

  return (
    <>
      <section className={common.section} aria-label={t('nutrition.diet.weekTitle')}>
        <h2 className={common.sectionTitle}>{t('nutrition.diet.weekTitle')}</h2>
        <div className={styles.days} role="tablist" aria-label={t('nutrition.plan.days')}>
          {days.map((d, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === selected} className={plan.dayPill} onClick={() => setSelected(i)}>
              {t('nutrition.diet.dayShort', { n: i + 1 })}
              {!d.check.ok && <span className={styles.dot} aria-label={t('nutrition.diet.offTarget')} />}
            </button>
          ))}
        </div>
        <p className={styles.dayTotal}>
          <Badge tone={day.check.ok ? 'ok' : 'warning'}>{day.check.ok ? t('nutrition.diet.onTarget') : t('nutrition.diet.offTarget')}</Badge>{' '}
          <Num>{t('nutrition.diet.dayTotal', { kcal: whole(day.totals.kcal), p: whole(day.totals.proteinG), c: whole(day.totals.carbG), f: whole(day.totals.fatG) })}</Num>
        </p>
        <div className={plan.meals}>
          {day.meals.map((m, mi) => (
            <section key={mi} className={plan.meal} aria-label={t(`nutrition.diet.slot.${m.slot.label}`)}>
              <header className={plan.mealHead}>
                <div className={plan.mealName}>
                  <h3>{t(`nutrition.diet.slot.${m.slot.label}`)}</h3>
                  <bdi className="num">{m.slot.time}</bdi>
                </div>
                <p className={plan.mealKcal}>
                  <Num>{kcalText(m.totals.kcal)}</Num> {t('nutrition.units.kcal')}
                </p>
              </header>
              <ul className={plan.items}>
                {m.items.map((item, ii) => {
                  const r = byId.get(item.recipeId);
                  const icon = iconOf(item.recipeId);
                  return (
                    <li key={`${item.recipeId}-${ii}`} className={plan.item}>
                      <FoodImage imageId={icon.imageId} icon={icon.icon} className={plan.itemImg} />
                      <div className={plan.itemText}>
                        <p className={plan.itemName}>{r?.name ?? t('nutrition.plan.missingRecipe')}</p>
                        <p className={plan.itemSub}>{t('nutrition.diet.servings', { n: item.servings })}</p>
                      </div>
                      {ii === 0 && (
                        <button type="button" className={plan.swap} onClick={() => setSwapping({ day: selected, meal: mi })} aria-label={t('nutrition.plan.swapLabel', { name: r?.name ?? '' })}>
                          {t('nutrition.diet.swap')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className={common.section}>
        <div className={common.tile}>
          <h2 className={common.sectionTitle}>{t('nutrition.diet.notesTitle')}</h2>
          <ul className={styles.notes}>
            {noteKeys.map((k) => (
              <li key={k}>{t(`nutrition.diet.notes.${k}` as 'nutrition.diet.notes.water')}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={common.section}>
        {(existing?.length ?? 0) > 0 && (
          <label className={styles.check}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            {t('nutrition.diet.replaceExisting')}
          </label>
        )}
        <p className={common.caption}>{t('nutrition.diet.editAfter')}</p>
        <div className={common.actions}>
          <Button icon="check" disabled={busy} onClick={() => void save()}>
            {t('nutrition.diet.save')}
          </Button>
        </div>
      </section>

      {swapping && swapMeal && (
        <SwapDietSheet
          meal={swapMeal}
          book={book}
          names={byId}
          targets={targets}
          goal={goal}
          style={style}
          vegetarian={vegetarian}
          ds={ds}
          onClose={() => setSwapping(null)}
          onPick={(item) => swapIn(swapping.day, swapping.meal, item)}
        />
      )}
    </>
  );
}

function SwapDietSheet({
  meal,
  book,
  names,
  targets,
  goal,
  style,
  vegetarian,
  ds,
  onClose,
  onPick,
}: {
  meal: DietMeal;
  book: DietRecipe[];
  names: ReadonlyMap<string, { name: string }>;
  targets: MacroTargets;
  goal: DietGoal;
  style: DietStyle;
  vegetarian: boolean;
  ds: DietSettings;
  onClose: () => void;
  onPick: (item: DietItem) => void;
}) {
  const k = meal.slot.sharePercent / 100;
  const mealTarget = { kcal: targets.kcal * k, proteinG: targets.proteinG * k, carbG: targets.carbG * k, fatG: targets.fatG * k };
  const current = meal.items[0]?.recipeId ?? null;
  // The meal's own calories (main dish plus its sides) are what the new main should roughly replace.
  const sides = meal.items.slice(1).reduce((acc, i) => acc + (book.find((b) => b.id === i.recipeId)?.perServing.kcal ?? 0) * i.servings, 0);
  const wanted = { ...mealTarget, kcal: Math.max(mealTarget.kcal - sides, mealTarget.kcal * 0.4) };
  const alts = slotAlternatives(book, wanted, meal.slot.kind, goal, ds, current, 8, { vegetarian, style });
  return (
    <Sheet open onClose={onClose} title={t('nutrition.diet.swapTitle', { name: names.get(current ?? '')?.name ?? '' })} cancelLabel={t('common.cancel')}>
      {alts.length === 0 && <p className={common.muted}>{t('nutrition.diet.swapNone')}</p>}
      <ul className={styles.alts}>
        {alts.map((a) => {
          const per = book.find((b) => b.id === a.recipeId)?.perServing.kcal ?? 0;
          return (
            <li key={a.recipeId}>
              <button type="button" className={styles.alt} onClick={() => onPick(a)}>
                <Num>{t('nutrition.diet.swapPick', { name: names.get(a.recipeId)?.name ?? '', servings: a.servings, kcal: whole(per * a.servings) })}</Num>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
