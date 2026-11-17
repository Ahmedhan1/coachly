import { DIET_TAGS, isSide, recipeKinds, type DietRecipe } from './dietBook';
import type { DietSettings } from './dietSettings';
import { slotsFor, type DietSchedule, type DietSlot, type MealKind, type MealsPerDay } from './dietSlots';
import type { DietGoal, DietStyle, MacroTargets } from './dietTargets';
import { ZERO_TOTALS, addTotals, type MacroTotals } from './totals';

export interface DietItem {
  recipeId: string;
  servings: number;
}

export interface DietMeal {
  slot: DietSlot;
  items: DietItem[];
  totals: MacroTotals;
}

export type MacroStatus = 'under' | 'on' | 'over';

export interface MacroCheck {
  kcal: MacroStatus;
  protein: MacroStatus;
  carb: MacroStatus;
  fat: MacroStatus;
  /** Calories on target and protein not short. */
  ok: boolean;
}

export interface DietDay {
  meals: DietMeal[];
  totals: MacroTotals;
  check: MacroCheck;
}

export interface DayContext {
  goal: DietGoal;
  slots: readonly DietSlot[];
  dayIndex: number;
  /** Main dishes to avoid (yesterday's). */
  recent: ReadonlySet<string>;
  exclude?: ReadonlySet<string>;
  vegetarian?: boolean;
  style?: DietStyle;
}

const status = (actual: number, target: number, tolerancePercent: number, lowerOnly = false): MacroStatus => {
  const band = (target * tolerancePercent) / 100;
  if (actual < target - band) return 'under';
  if (!lowerOnly && actual > target + band) return 'over';
  return 'on';
};

/** Compares a day to its targets. Calories use the kcal tolerance; protein, carbs and fat the macro one. */
export function checkMacros(actual: MacroTotals, target: MacroTargets, ds: DietSettings): MacroCheck {
  const kcal = status(actual.kcal, target.kcal, ds.kcalTolerancePercent);
  const protein = status(actual.proteinG, target.proteinG, ds.macroTolerancePercent);
  const carb = status(actual.carbG, target.carbG, ds.macroTolerancePercent);
  const fat = status(actual.fatG, target.fatG, ds.macroTolerancePercent);
  return { kcal, protein, carb, fat, ok: kcal === 'on' && protein !== 'under' };
}

// ---------- helpers ----------

const hash = (s: string): number => {
  let h = 17;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100_003;
  return h;
};

const roundStep = (x: number, step: number) => Math.round(x / step) * step;
/** Keeps servings on the step grid and free of float noise (0.1 + 0.2 style drift). */
const clean = (x: number) => Math.round(x * 1000) / 1000;

function clampServings(x: number, ds: DietSettings): number {
  return clean(Math.min(ds.maxServings, Math.max(ds.minServings, roundStep(x, ds.servingStep))));
}

const scale = (p: MacroTotals, k: number): MacroTotals => ({ kcal: p.kcal * k, proteinG: p.proteinG * k, carbG: p.carbG * k, fatG: p.fatG * k });

/** How far a dish's calorie split is from the split a slot wants (0 = identical). */
function profileGap(per: MacroTotals, want: MacroTargets): number {
  const have = per.proteinG * 4 + per.carbG * 4 + per.fatG * 9;
  const need = want.proteinG * 4 + want.carbG * 4 + want.fatG * 9;
  if (have <= 0 || need <= 0) return 1;
  return (
    Math.abs((per.proteinG * 4) / have - (want.proteinG * 4) / need) +
    Math.abs((per.carbG * 4) / have - (want.carbG * 4) / need) +
    Math.abs((per.fatG * 9) / have - (want.fatG * 9) / need)
  );
}

function goalBonus(recipe: DietRecipe, goal: DietGoal, style: DietStyle | undefined): number {
  let bonus = 0;
  if (goal === 'cut' && recipe.tags.includes(DIET_TAGS.cut)) bonus += 0.15;
  if (goal === 'bulk' && recipe.tags.includes(DIET_TAGS.bulk)) bonus += 0.15;
  if ((goal === 'recomp' || style === 'high_protein') && recipe.tags.includes(DIET_TAGS.highProtein)) bonus += 0.15;
  if (goal === 'cut' && recipe.tags.includes(DIET_TAGS.highProtein)) bonus += 0.05;
  return bonus;
}

function slotTarget(day: MacroTargets, sharePercent: number): MacroTargets {
  const k = sharePercent / 100;
  return { kcal: day.kcal * k, proteinG: day.proteinG * k, carbG: day.carbG * k, fatG: day.fatG * k };
}

/** Lower is better. Mixes calorie-split fit, how many servings it would take, the goal tags and a stable jitter. */
function mainScore(recipe: DietRecipe, want: MacroTargets, goal: DietGoal, style: DietStyle | undefined, ds: DietSettings, salt: number): number {
  const per = recipe.perServing;
  const need = per.kcal > 0 ? want.kcal / per.kcal : Infinity;
  const outside = need < ds.minServings ? ds.minServings / need - 1 : need > ds.maxServings ? need / ds.maxServings - 1 : 0;
  const jitter = ((hash(recipe.id) + salt) % 100) / 100;
  return profileGap(per, want) + Math.min(2, outside) * 0.6 - goalBonus(recipe, goal, style) + jitter * 0.14;
}

function usable(book: readonly DietRecipe[], ctx: Pick<DayContext, 'exclude' | 'vegetarian'>): DietRecipe[] {
  return book.filter((r) => !ctx.exclude?.has(r.id) && (!ctx.vegetarian || r.tags.includes(DIET_TAGS.vegetarian)));
}

/** Main-dish candidates for a kind, widening step by step when the book has few of them. */
function mainCandidates(pool: readonly DietRecipe[], kind: MealKind): DietRecipe[] {
  const dishes = pool.filter((r) => !isSide(r) && r.perServing.kcal > 0);
  const ofKind = dishes.filter((r) => recipeKinds(r).includes(kind));
  if (ofKind.length > 0) return ofKind;
  if (dishes.length > 0) return dishes;
  return pool.filter((r) => r.perServing.kcal > 0);
}

// ---------- one day ----------

interface Work {
  recipe: DietRecipe;
  servings: number;
  main: boolean;
}

const MAX_ITEMS_PER_MEAL = 3;
const MAX_STEPS = 90;

function dayCost(work: readonly Work[][], slots: readonly DietSlot[], target: MacroTargets, ds: DietSettings): number {
  let total = ZERO_TOTALS;
  let slotGap = 0;
  work.forEach((items, i) => {
    let kcal = 0;
    for (const w of items) {
      const t = scale(w.recipe.perServing, w.servings);
      total = addTotals(total, t);
      kcal += t.kcal;
    }
    slotGap += Math.abs(kcal - (target.kcal * (slots[i]?.sharePercent ?? 0)) / 100);
  });
  const rel = (a: number, t: number, floor: number) => Math.abs(a - t) / Math.max(t, floor);
  const kcalGap = rel(total.kcal, target.kcal, 200);
  const proteinShort = Math.max(0, target.proteinG - total.proteinG) / Math.max(target.proteinG, 20);
  const proteinOver = Math.max(0, total.proteinG - target.proteinG) / Math.max(target.proteinG, 20);
  // Inside the tolerance band the pull is gentle; outside it the pull is steep, so both land in band first.
  return (
    3 * kcalGap +
    30 * Math.max(0, kcalGap - ds.kcalTolerancePercent / 100 + 0.005) +
    4 * proteinShort +
    30 * Math.max(0, proteinShort - ds.macroTolerancePercent / 100 + 0.01) +
    0.8 * proteinOver +
    1.2 * rel(total.carbG, target.carbG, 40) +
    1.2 * rel(total.fatG, target.fatG, 15) +
    1.5 * (slotGap / Math.max(target.kcal, 200))
  );
}

function toDay(work: readonly Work[][], slots: readonly DietSlot[], target: MacroTargets, ds: DietSettings): DietDay {
  const meals: DietMeal[] = slots.map((slot, i) => {
    const items = (work[i] ?? []).map((w) => ({ recipeId: w.recipe.id, servings: w.servings }));
    const totals = (work[i] ?? []).reduce((acc, w) => addTotals(acc, scale(w.recipe.perServing, w.servings)), ZERO_TOTALS);
    return { slot, items, totals };
  });
  const totals = meals.reduce((acc, m) => addTotals(acc, m.totals), ZERO_TOTALS);
  return { meals, totals, check: checkMacros(totals, target, ds) };
}

/**
 * Builds one day: a main dish per meal (varied, fitting the meal's calorie split), then a greedy search over
 * serving sizes and small side dishes until calories and protein land on target. Deterministic for the same
 * inputs, so the same plan is rebuilt after a swap elsewhere.
 */
export function planDay(book: readonly DietRecipe[], target: MacroTargets, ctx: DayContext, ds: DietSettings): DietDay {
  const pool = usable(book, ctx);
  const { slots } = ctx;
  const usedToday = new Set<string>();
  const work: Work[][] = slots.map(() => []);

  slots.forEach((slot, i) => {
    const want = slotTarget(target, slot.sharePercent);
    const all = mainCandidates(pool, slot.kind);
    const fresh = all.filter((r) => !ctx.recent.has(r.id) && !usedToday.has(r.id));
    const choices = fresh.length > 0 ? fresh : all.filter((r) => !usedToday.has(r.id)).length > 0 ? all.filter((r) => !usedToday.has(r.id)) : all;
    const salt = ctx.dayIndex * 31 + i * 17;
    let best: DietRecipe | undefined;
    let bestScore = Infinity;
    for (const r of choices) {
      const s = mainScore(r, want, ctx.goal, ctx.style, ds, salt);
      if (s < bestScore) {
        best = r;
        bestScore = s;
      }
    }
    if (!best) return;
    usedToday.add(best.id);
    work[i] = [{ recipe: best, servings: clampServings(want.kcal / best.perServing.kcal, ds), main: true }];
  });

  const sides = pool.filter((r) => isSide(r) && r.perServing.kcal > 0);
  let cost = dayCost(work, slots, target, ds);
  for (let step = 0; step < MAX_STEPS; step++) {
    const usedMains = new Set(work.flatMap((items) => items.filter((w) => w.main).map((w) => w.recipe.id)));
    let bestMove: { i: number; next: Work[] } | null = null;
    let bestCost = cost - 1e-9;
    const consider = (i: number, next: Work[]) => {
      const trial = work.map((w, j) => (j === i ? next : w));
      const c = dayCost(trial, slots, target, ds);
      if (c < bestCost) {
        bestCost = c;
        bestMove = { i, next };
      }
    };
    work.forEach((items, i) => {
      if (items.length === 0) return;
      items.forEach((w, k) => {
        for (const dir of [1, -1]) {
          const servings = clean(w.servings + dir * ds.servingStep);
          if (servings > ds.maxServings) continue;
          if (servings < ds.minServings) {
            if (!w.main) consider(i, items.filter((_, j) => j !== k));
            continue;
          }
          consider(i, items.map((x, j) => (j === k ? { ...x, servings } : x)));
        }
      });
      const main = items[0];
      const mainKind = slots[i]?.kind;
      if (main?.main && mainKind) {
        const kcalNow = main.recipe.perServing.kcal * main.servings;
        for (const r of mainCandidates(pool, mainKind)) {
          if (usedMains.has(r.id) || items.some((w) => w.recipe.id === r.id) || ctx.recent.has(r.id)) continue;
          consider(i, [{ recipe: r, servings: clampServings(kcalNow / r.perServing.kcal, ds), main: true }, ...items.slice(1)]);
        }
      }
      const kind = slots[i]?.kind;
      if (kind && items.length < MAX_ITEMS_PER_MEAL) {
        for (const s of sides) {
          if (items.some((w) => w.recipe.id === s.id) || !recipeKinds(s).includes(kind)) continue;
          consider(i, [...items, { recipe: s, servings: clampServings(1, ds), main: false }]);
        }
      }
    });
    if (!bestMove) break;
    const move: { i: number; next: Work[] } = bestMove;
    work[move.i] = move.next;
    cost = bestCost;
  }
  return toDay(work, slots, target, ds);
}

// ---------- a week ----------

export interface WeekOptions {
  goal: DietGoal;
  schedule: DietSchedule;
  mealsPerDay: MealsPerDay;
  days: number;
  style?: DietStyle;
  vegetarian?: boolean;
  exclude?: ReadonlySet<string>;
}

/** Plans consecutive days; each day avoids the previous day's main dishes. */
export function planWeek(book: readonly DietRecipe[], target: MacroTargets, opts: WeekOptions, ds: DietSettings): DietDay[] {
  const slots = slotsFor(opts.schedule, opts.mealsPerDay, ds);
  const out: DietDay[] = [];
  let recent: ReadonlySet<string> = new Set();
  for (let d = 0; d < opts.days; d++) {
    const day = planDay(book, target, { goal: opts.goal, slots, dayIndex: d, recent, exclude: opts.exclude, vegetarian: opts.vegetarian, style: opts.style }, ds);
    out.push(day);
    recent = new Set(day.meals.flatMap((m) => (m.items[0] ? [m.items[0].recipeId] : [])));
  }
  return out;
}

// ---------- swaps ----------

/** How far a calorie amount may be from the meal's target and still be offered as a swap. */
const ALTERNATIVE_BAND = 0.3;

/**
 * Other dishes for one meal, each with the servings that bring it to the meal's calories, best fit first.
 * The current dish is never offered back.
 */
export function slotAlternatives(
  book: readonly DietRecipe[],
  mealTarget: MacroTargets,
  kind: MealKind,
  goal: DietGoal,
  ds: DietSettings,
  currentId: string | null,
  limit: number,
  opts: { vegetarian?: boolean; exclude?: ReadonlySet<string>; style?: DietStyle } = {},
): DietItem[] {
  const pool = usable(book, opts).filter((r) => r.id !== currentId);
  const candidates = mainCandidates(pool, kind);
  const scored = candidates
    .map((r) => {
      const servings = clampServings(mealTarget.kcal / r.perServing.kcal, ds);
      const kcal = r.perServing.kcal * servings;
      return { r, servings, off: Math.abs(kcal - mealTarget.kcal) / Math.max(mealTarget.kcal, 1) };
    })
    .filter((c) => c.off <= ALTERNATIVE_BAND);
  scored.sort((a, b) => {
    const sa = profileGap(a.r.perServing, mealTarget) + a.off - goalBonus(a.r, goal, opts.style);
    const sb = profileGap(b.r.perServing, mealTarget) + b.off - goalBonus(b.r, goal, opts.style);
    return sa - sb || a.r.id.localeCompare(b.r.id);
  });
  return scored.slice(0, Math.max(0, limit)).map((c) => ({ recipeId: c.r.id, servings: c.servings }));
}

// ---------- after a manual change ----------

/** Rebuilds totals and checks for a day whose items the trainer changed (a swap); unknown recipes count as zero. */
export function recomputeDay(meals: ReadonlyArray<{ slot: DietSlot; items: readonly DietItem[] }>, book: readonly DietRecipe[], target: MacroTargets, ds: DietSettings): DietDay {
  const byId = new Map(book.map((r) => [r.id, r.perServing]));
  const rebuilt: DietMeal[] = meals.map((m) => {
    const totals = m.items.reduce((acc, i) => {
      const per = byId.get(i.recipeId);
      return per ? addTotals(acc, scale(per, i.servings)) : acc;
    }, ZERO_TOTALS);
    return { slot: m.slot, items: m.items.map((i) => ({ ...i })), totals };
  });
  const totals = rebuilt.reduce((acc, m) => addTotals(acc, m.totals), ZERO_TOTALS);
  return { meals: rebuilt, totals, check: checkMacros(totals, target, ds) };
}
