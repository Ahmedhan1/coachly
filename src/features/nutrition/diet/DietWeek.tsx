import { useMemo, useState } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import {
  dayFiber,
  dishAlternatives,
  fiberTarget,
  fillRatio,
  nextDayNumber,
  nudgeStep,
  recipeIconHex,
  retargetDay,
  savedDish,
  setLineGrams,
  swapDish,
  toggleLineLock,
  type CycleDayType,
  type DietSettings,
  type DietSlot,
  type GramDay,
  type GramLine,
  type GramPlanOptions,
  type GramRecipe,
  type IngredientEntry,
  type LineRef,
  type MacroTargets,
} from '@/domain/meals';
import type { Client, Meal } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Badge, Button, Icon, Sheet, Tx } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import { parseDecimal } from '../shared/numbers';
import { useNutritionStore } from '../shared/useNutritionStore';
import { ShoppingSheet } from './ShoppingSheet';
import cal from './Cal.module.css';
import type { RecipeWithNutrition } from '../meals/useRecipeLookup';
import common from '../shared/common.module.css';
import plan from '../meals/MealPlan.module.css';
import styles from './Diet.module.css';

interface Props {
  client: Client;
  week: GramDay[];
  book: GramRecipe[];
  recipes: RecipeWithNutrition[];
  foods: IngredientEntry[];
  /** Per-serving calories by recipe id (for the servings number older readers use). */
  perServing: ReadonlyMap<string, number>;
  /** Targets per plan day (all the same unless carb cycling is on). */
  targets: readonly MacroTargets[];
  /** The meal layout with the trainer's split; edited days follow it. */
  slots: readonly DietSlot[];
  dayTypes: readonly CycleDayType[] | null;
  water: { minMl: number; maxMl: number } | null;
  options: GramPlanOptions;
  ds: DietSettings;
  noteKeys: string[];
  onSaved: () => void;
}

const newId = () => crypto.randomUUID();
const sameTargets = (a: MacroTargets, b: MacroTargets) => a.kcal === b.kcal && a.proteinG === b.proteinG && a.carbG === b.carbG && a.fatG === b.fatG;

/** The generated week in exact grams: every food with its weight, calories and macros, editable, then save. */
export function DietWeek({ client, week, book, recipes, foods, perServing, targets, slots, dayTypes, water, options, ds, noteKeys, onSaved }: Props) {
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const icons = useLive(() => store.getIngredients(), [store]);
  const [selected, setSelected] = useState(0);
  const [edits, setEdits] = useState<ReadonlyMap<number, GramDay>>(new Map());
  const [swapping, setSwapping] = useState<{ meal: number; dish: number } | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shopping, setShopping] = useState(false);
  const existing = useLive(() => repos.mealPlans.listByClient(client.id), [repos, client.id]);

  // A day the trainer edited keeps its dishes and locked amounts; new targets re-balance the rest.
  const days = useMemo(
    () =>
      week.map((d, i) => {
        const e = edits.get(i);
        if (!e) return d;
        const tg = targets[i] ?? e.target;
        const sameSplit = e.meals.every((m, mi) => m.slot.sharePercent === slots[mi]?.sharePercent && m.slot.carbWeight === slots[mi]?.carbWeight);
        return sameTargets(e.target, tg) && sameSplit ? e : retargetDay(e, tg, ds, slots);
      }),
    [week, edits, targets, slots, ds],
  );
  const day = days[selected] ?? days[0];
  const byId = useMemo(() => new Map(recipes.map((r) => [r.recipe.id as string, r.recipe])), [recipes]);
  const foodByName = useMemo(() => new Map(foods.map((f) => [f.name, f])), [foods]);
  if (!day) return null;

  const change = (next: GramDay) => setEdits(new Map(edits).set(selected, next));
  const recipeName = (id: string) => {
    const r = byId.get(id);
    return r ? pick(r.name, r.nameEn) : t('nutrition.plan.missingRecipe');
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
        const meals: Meal[] = d.meals.map((m) => ({
          id: newId() as Meal['id'],
          name: t(`nutrition.diet.slot.${m.slot.label}`),
          time: m.slot.time as Meal['time'],
          items: m.dishes.map((dish) => {
            const s = savedDish(dish, perServing.get(dish.recipeId) ?? 0);
            return { recipeId: s.recipeId as Meal['items'][number]['recipeId'], text: '', servings: s.servings, lines: s.lines };
          }),
        }));
        const created1 = await repos.mealPlans.create({
          clientId: client.id,
          name: t('nutrition.plan.dayName', { n: n++ }),
          targetKcal: Math.round(d.target.kcal),
          meals,
          notes: index === 0 ? notes : '',
        });
        created.push(created1.id);
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

  const tg = day.target;
  const swapMeal = swapping ? day.meals[swapping.meal] : undefined;
  const swapCurrent = swapping ? swapMeal?.dishes[swapping.dish] : undefined;

  return (
    <>
      <section className={common.section} aria-label={t('nutrition.diet.weekTitle')}>
        <h2 className={common.sectionTitle}>{t('nutrition.diet.weekTitle')}</h2>
        <div className={styles.days} role="tablist" aria-label={t('nutrition.plan.days')}>
          {days.map((d, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === selected} className={plan.dayPill} onClick={() => setSelected(i)}>
              {t('nutrition.diet.dayShort', { n: i + 1 })}
              {dayTypes?.[i] && dayTypes[i] !== 'rest' && <span className={cal.tag}>{t(`nutrition.cal.dayType.${dayTypes[i] ?? 'rest'}`)}</span>}
              {!d.check.ok && <span className={styles.dot} aria-label={t('nutrition.diet.offTarget')} />}
            </button>
          ))}
        </div>
        <div className={styles.dayBox} role="status" aria-label={t('nutrition.diet.dayTotalsTitle')}>
          <div className={styles.dayBoxHead}>
            <span className={styles.dayBoxTitle}>{t('nutrition.diet.dayTotalsTitle')}</span>
            <Badge tone={day.check.ok ? 'ok' : 'warning'}>{day.check.ok ? t('nutrition.diet.onTarget') : t('nutrition.diet.offTarget')}</Badge>
          </div>
          <dl className={styles.dayGrid}>
            {(
              [
                ['kcal', t('nutrition.diet.kcal'), day.totals.kcal, tg.kcal, day.check.kcal],
                ['p', t('nutrition.macros.protein'), day.totals.proteinG, tg.proteinG, day.check.protein],
                ['c', t('nutrition.macros.carb'), day.totals.carbG, tg.carbG, day.check.carb],
                ['f', t('nutrition.macros.fat'), day.totals.fatG, tg.fatG, day.check.fat],
              ] as const
            ).map(([k, label, value, target, status]) => (
              <div key={k} data-status={status}>
                <dt>{label}</dt>
                <dd className="num">{value}</dd>
                <dd className={styles.of}>
                  <Tx k="nutrition.diet.targetShort" params={{ n: Math.round(target) }} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <DayBars day={day} water={water} />
        <p className={common.caption}>{t('nutrition.diet.lockHint')}</p>
        <div className={plan.meals}>
          {day.meals.map((m, mi) => (
            <section key={mi} className={plan.meal} aria-label={t(`nutrition.diet.slot.${m.slot.label}`)}>
              <header className={plan.mealHead}>
                <div className={plan.mealName}>
                  <h3>{t(`nutrition.diet.slot.${m.slot.label}`)}</h3>
                  <bdi className="num">{m.slot.time}</bdi>
                </div>
                <p className={plan.mealKcal}>
                  <Tx k="nutrition.diet.mealOf" params={{ kcal: m.totals.kcal, target: Math.round(m.target.kcal) }} />
                </p>
              </header>
              <Bar value={m.totals.kcal} target={m.target.kcal} tolerance={ds.kcalTolerancePercent * 2} label={t('nutrition.cal.mealBar', { kcal: m.totals.kcal, target: Math.round(m.target.kcal) })} />
              {m.dishes.map((dish, di) => {
                const r = byId.get(dish.recipeId);
                const name = recipeName(dish.recipeId);
                return (
                  <div key={`${dish.recipeId}-${di}`} className={styles.dish}>
                    <div className={styles.dishHead}>
                      <FoodImage imageId={r?.imageId} icon={r ? recipeIconHex(r.ingredients, icons ?? foods) : undefined} className={styles.dishImg} />
                      <p className={styles.dishName}>{name}</p>
                      <span className={`${styles.dishKcal} num`}>{dish.totals.kcal}</span>
                      <button type="button" className={plan.swap} onClick={() => setSwapping({ meal: mi, dish: di })} aria-label={t('nutrition.diet.swapDish', { name })}>
                        <Icon name="undo" />
                        {t('nutrition.diet.swap')}
                      </button>
                    </div>
                    <ul className={styles.lines}>
                      {dish.lines.map((line, li) => (
                        <LineRow
                          key={`${line.src.name}-${li}`}
                          line={line}
                          food={foodByName.get(line.src.name)}
                          onSet={(grams) => change(setLineGrams(day, { meal: mi, dish: di, line: li }, grams, ds))}
                          onLock={() => change(toggleLineLock(day, { meal: mi, dish: di, line: li } satisfies LineRef, ds))}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <p className={common.caption}>{t('nutrition.diet.weightsNote')}</p>
        <div className={common.actions}>
          <Button variant="secondary" icon="list" onClick={() => setShopping(true)}>
            {t('nutrition.cal.shopOpen')}
          </Button>
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

      {shopping && <ShoppingSheet days={days} clientName={client.name} onClose={() => setShopping(false)} />}

      {swapping && swapMeal && swapCurrent && (
        <Sheet
          open
          onClose={() => setSwapping(null)}
          title={t('nutrition.diet.swapDishTitle', { name: recipeName(swapCurrent.recipeId), slot: t(`nutrition.diet.slot.${swapMeal.slot.label}`) })}
          cancelLabel={t('common.cancel')}
        >
          <SwapList
            alts={dishAlternatives(book, day, swapping.meal, swapping.dish, options, 10)}
            name={recipeName}
            onPick={(id) => {
              change(swapDish(day, book, swapping.meal, swapping.dish, id, ds));
              setSwapping(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

function SwapList({ alts, name, onPick }: { alts: { recipeId: string; kcal: number }[]; name: (id: string) => string; onPick: (id: string) => void }) {
  if (alts.length === 0) return <p className={common.muted}>{t('nutrition.diet.swapNone')}</p>;
  return (
    <ul className={styles.alts}>
      {alts.map((a) => (
        <li key={a.recipeId}>
          <button type="button" className={styles.alt} onClick={() => onPick(a.recipeId)}>
            <span>{name(a.recipeId)}</span>
            <span className={styles.altKcal}>
              <Tx k="nutrition.diet.swapKcal" params={{ kcal: a.kcal }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One food: name, exact grams (or units + grams), its calories and macros, − / typed grams / + and a lock. */
function LineRow({ line, food, onSet, onLock }: { line: GramLine; food: IngredientEntry | undefined; onSet: (grams: number) => void; onLock: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const name = pick(line.src.name, line.src.nameEn);
  const fixed = line.role === 'fixed';
  const step = nudgeStep(line);
  const amount =
    line.units !== null && line.src.unitLabel ? (
      <Tx k="nutrition.diet.unitGrams" params={{ n: line.units, unit: pick(line.src.unitLabel, line.src.unitLabelEn), g: line.grams }} />
    ) : (
      <Tx k="nutrition.diet.grams" params={{ g: line.grams }} />
    );
  const commit = () => {
    if (text === null) return;
    const n = parseDecimal(text);
    setText(null);
    if (Number.isFinite(n) && n > 0 && n !== line.grams) onSet(n);
  };
  return (
    <li className={styles.line} data-locked={line.locked || undefined}>
      <FoodImage imageId={food?.imageId} food={food} className={styles.lineImg} />
      <div className={styles.lineText}>
        <p className={styles.lineName}>{name}</p>
        <p className={styles.lineSub}>
          {amount}
          {' · '}
          <Tx k="nutrition.diet.lineMacros" params={{ kcal: line.shown.kcal, p: line.shown.proteinG, c: line.shown.carbG, f: line.shown.fatG }} />
        </p>
      </div>
      {!fixed && (
        <div className={styles.lineControls}>
          <button type="button" className={styles.stepBtn} aria-label={t('nutrition.diet.less', { name })} onClick={() => onSet(Math.max(step, line.grams - step))}>
            −
          </button>
          <input
            className={`${styles.gramsInput} num`}
            inputMode="decimal"
            aria-label={t('nutrition.diet.gramsLabel', { name })}
            value={text ?? String(line.grams)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <button type="button" className={styles.stepBtn} aria-label={t('nutrition.diet.more', { name })} onClick={() => onSet(line.grams + step)}>
            +
          </button>
          <button
            type="button"
            className={styles.lockBtn}
            aria-pressed={line.locked}
            aria-label={line.locked ? t('nutrition.diet.unlock', { name }) : t('nutrition.diet.lock', { name })}
            onClick={onLock}
          >
            <Icon name={line.locked ? 'lock' : 'unlock'} />
          </button>
        </div>
      )}
    </li>
  );
}

/** A thin progress bar: value against target; outside ± tolerance % it shows as under / over. */
function Bar({ value, target, tolerance, label }: { value: number; target: number; tolerance: number; label: string }) {
  const r = fillRatio(value, target);
  const status = target > 0 && Math.abs(value - target) / target > tolerance / 100 ? (value > target ? 'over' : 'under') : 'on';
  return (
    <div className={cal.bar} data-status={status} role="meter" aria-valuemin={0} aria-valuemax={Math.round(target)} aria-valuenow={Math.round(value)} aria-label={label}>
      <span style={{ inlineSize: `${Math.min(100, r * 100)}%` }} />
    </div>
  );
}

/** Day macros as bars against their targets, plus fibre (14 g / 1000 kcal) and the water range. */
function DayBars({ day, water }: { day: GramDay; water: { minMl: number; maxMl: number } | null }) {
  const tg = day.target;
  const fiber = dayFiber(day);
  const fTarget = fiberTarget(tg.kcal);
  const rows = [
    ['kcal', t('nutrition.diet.kcal'), day.totals.kcal, tg.kcal],
    ['p', t('nutrition.macros.protein'), day.totals.proteinG, tg.proteinG],
    ['c', t('nutrition.macros.carb'), day.totals.carbG, tg.carbG],
    ['f', t('nutrition.macros.fat'), day.totals.fatG, tg.fatG],
  ] as const;
  const liters = (ml: number) => Math.round(ml / 100) / 10;
  return (
    <div className={styles.dayBox} aria-label={t('nutrition.cal.dayBarsTitle')} role="group">
      <dl className={cal.bars}>
        {rows.map(([k, label, value, target]) => (
          <div key={k}>
            <dt>
              <span>{label}</span>
              <bdi className="num">
                {value}/{Math.round(target)}
              </bdi>
            </dt>
            <dd>
              <Bar value={value} target={target} tolerance={10} label={`${label} ${value}/${Math.round(target)}`} />
            </dd>
          </div>
        ))}
        <div>
          <dt>
            <span>{t('nutrition.cal.fiber')}</span>
            <span>
              <Tx k="nutrition.cal.fiberLine" params={{ g: fiber, target: fTarget }} />
            </span>
          </dt>
          <dd>
            <Bar value={fiber} target={fTarget} tolerance={30} label={t('nutrition.cal.fiberLine', { g: fiber, target: fTarget })} />
          </dd>
        </div>
        {water && (
          <div>
            <dt>
              <span>{t('nutrition.cal.water')}</span>
              <span>
                <Tx k="nutrition.cal.waterLine" params={{ min: liters(water.minMl), max: liters(water.maxMl) }} />
              </span>
            </dt>
          </div>
        )}
      </dl>
    </div>
  );
}
