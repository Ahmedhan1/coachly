import { DIET_TAGS, isSide, recipeKinds } from './dietBook';
import { checkMacros, goalBonus, type MacroCheck } from './dietPlanner';
import type { DietSettings } from './dietSettings';
import { mealTargets } from './mealSplit';
import { slotsFor, type DietSchedule, type DietSlot, type MealKind, type MealsPerDay } from './dietSlots';
import type { DietGoal, DietStyle, MacroTargets } from './dietTargets';
import {
  ZERO_SHOWN,
  addShown,
  lineBounds,
  lineRole,
  roundGrams,
  roundingFor,
  shownMacros,
  type FoodLineSource,
  type LineRole,
  type ShownMacros,
} from './foodLines';

/** A recipe for the gram planner: its slot tags and the foods of one serving. */
export interface GramRecipe {
  id: string;
  tags: readonly string[];
  lines: readonly FoodLineSource[];
}

export interface GramLine {
  src: FoodLineSource;
  role: LineRole;
  /** Exact grams shown (already rounded to the food's step or units). */
  grams: number;
  /** Count for eggs and loaves (2 eggs, 1.5 loaves), else null. */
  units: number | null;
  /** Set by hand: the solver never changes it. */
  locked: boolean;
  shown: ShownMacros;
}

export interface GramDish {
  recipeId: string;
  lines: GramLine[];
  totals: ShownMacros;
}

export interface GramMeal {
  slot: DietSlot;
  /** What this meal aims at (its share of the day). */
  target: MacroTargets;
  dishes: GramDish[];
  totals: ShownMacros;
}

export interface GramDay {
  target: MacroTargets;
  meals: GramMeal[];
  /** Sum of the shown (rounded) items. */
  totals: ShownMacros;
  check: MacroCheck;
}

export interface GramPlanOptions {
  goal: DietGoal;
  style?: DietStyle;
  vegetarian?: boolean;
  exclude?: ReadonlySet<string>;
  /** Score bonus per recipe id (the client loves it: positive; costly in budget mode: negative). */
  boost?: ReadonlyMap<string, number>;
}

// ---------- the solver ----------

interface WLine {
  src: FoodLineSource;
  role: LineRole;
  min: number;
  max: number;
  grams: number;
  locked: boolean;
  /** Held for this solve only (counted food already rounded). */
  held: boolean;
}

interface WMeal {
  target: MacroTargets;
  dishes: { recipeId: string; lines: WLine[] }[];
  free: boolean;
}

interface Weights {
  mealKcal: number;
  mealMacro: number;
  day: number;
  keepShape: number;
}

const PLAN_WEIGHTS: Weights = { mealKcal: 1, mealMacro: 0.35, day: 1.2, keepShape: 0.03 };
const MEAL_WEIGHTS: Weights = { mealKcal: 1, mealMacro: 0.5, day: 0, keepShape: 0.03 };
const ROLES: readonly LineRole[] = ['protein', 'carb', 'fat'];
const SWEEPS = 80;

interface Var {
  meal: number;
  lines: WLine[];
  x: number;
  lo: number;
  hi: number;
  /** kcal, P, C, F per unit of x. */
  k: number;
  p: number;
  c: number;
  f: number;
}

const valueOf = (l: WLine, key: 'kcal' | 'proteinG' | 'carbG' | 'fatG') => (l.src.per100g[key] * l.grams) / 100;

/**
 * Bounded least squares by exact coordinate steps. Each free meal has up to three levers (its protein foods,
 * carb foods and fat foods, each group scaled together from the recipe amounts). The cost pulls every meal to
 * its calories and macro share, the whole day to the day's macros, and gently towards the recipe's own shape.
 */
function solve(meals: WMeal[], day: MacroTargets, w: Weights): void {
  const vars: Var[] = [];
  meals.forEach((m, mi) => {
    if (!m.free) return;
    const all = m.dishes.flatMap((d) => d.lines);
    for (const role of ROLES) {
      const lines = all.filter((l) => l.role === role && !l.locked && !l.held);
      if (lines.length === 0) continue;
      let lo = 0;
      let hi = Infinity;
      let base = 0;
      let now = 0;
      const sum = { k: 0, p: 0, c: 0, f: 0 };
      for (const l of lines) {
        lo = Math.max(lo, l.min / l.src.grams);
        hi = Math.min(hi, l.max / l.src.grams);
        base += l.src.grams;
        now += l.grams;
        sum.k += (l.src.per100g.kcal * l.src.grams) / 100;
        sum.p += (l.src.per100g.proteinG * l.src.grams) / 100;
        sum.c += (l.src.per100g.carbG * l.src.grams) / 100;
        sum.f += (l.src.per100g.fatG * l.src.grams) / 100;
      }
      if (hi < lo) hi = lo;
      const x = Math.min(hi, Math.max(lo, base > 0 ? now / base : 1));
      vars.push({ meal: mi, lines, x, lo, hi, ...sum });
    }
  });
  if (vars.length === 0) return;
  // Apply the starting x so every line in a group sits on the same scale.
  for (const v of vars) for (const l of v.lines) l.grams = l.src.grams * v.x;

  const mealSum = meals.map((m) => {
    const s = { k: 0, p: 0, c: 0, f: 0 };
    for (const d of m.dishes)
      for (const l of d.lines) {
        s.k += valueOf(l, 'kcal');
        s.p += valueOf(l, 'proteinG');
        s.c += valueOf(l, 'carbG');
        s.f += valueOf(l, 'fatG');
      }
    return s;
  });
  const rK = meals.map((m, i) => (mealSum[i]?.k ?? 0) - m.target.kcal);
  const rP = meals.map((m, i) => 4 * ((mealSum[i]?.p ?? 0) - m.target.proteinG));
  const rC = meals.map((m, i) => 4 * ((mealSum[i]?.c ?? 0) - m.target.carbG));
  const rF = meals.map((m, i) => 9 * ((mealSum[i]?.f ?? 0) - m.target.fatG));
  const total = mealSum.reduce((a, s) => ({ k: a.k + s.k, p: a.p + s.p, c: a.c + s.c, f: a.f + s.f }), { k: 0, p: 0, c: 0, f: 0 });
  let dK = total.k - day.kcal;
  let dP = 4 * (total.p - day.proteinG);
  let dC = 4 * (total.c - day.carbG);
  let dF = 9 * (total.f - day.fatG);

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let moved = 0;
    for (const v of vars) {
      const m = v.meal;
      const pk = 4 * v.p;
      const ck = 4 * v.c;
      const fk = 9 * v.f;
      const g =
        2 * w.mealKcal * v.k * (rK[m] ?? 0) +
        2 * w.mealMacro * (pk * (rP[m] ?? 0) + ck * (rC[m] ?? 0) + fk * (rF[m] ?? 0)) +
        2 * w.day * (v.k * dK + pk * dP + ck * dC + fk * dF) +
        2 * w.keepShape * v.k * v.k * (v.x - 1);
      const h = 2 * w.mealKcal * v.k * v.k + 2 * w.mealMacro * (pk * pk + ck * ck + fk * fk) + 2 * w.day * (v.k * v.k + pk * pk + ck * ck + fk * fk) + 2 * w.keepShape * v.k * v.k;
      if (!(h > 0)) continue;
      const next = Math.min(v.hi, Math.max(v.lo, v.x - g / h));
      const d = next - v.x;
      if (d === 0) continue;
      v.x = next;
      moved = Math.max(moved, Math.abs(d));
      rK[m] = (rK[m] ?? 0) + v.k * d;
      rP[m] = (rP[m] ?? 0) + pk * d;
      rC[m] = (rC[m] ?? 0) + ck * d;
      rF[m] = (rF[m] ?? 0) + fk * d;
      dK += v.k * d;
      dP += pk * d;
      dC += ck * d;
      dF += fk * d;
    }
    if (moved < 1e-5) break;
  }
  for (const v of vars) for (const l of v.lines) l.grams = l.src.grams * v.x;
}

/** Continuous solve → round counted foods and hold them → solve again → round everything. */
function solveAndRound(meals: WMeal[], day: MacroTargets, w: Weights): void {
  solve(meals, day, w);
  let held = false;
  for (const m of meals) {
    if (!m.free) continue;
    for (const d of m.dishes)
      for (const l of d.lines) {
        if (l.locked || l.src.unitG === undefined || l.role === 'fixed') continue;
        l.grams = roundGrams(l.grams, roundingFor(l.src, l.role)).grams;
        l.held = true;
        held = true;
      }
  }
  if (held) solve(meals, day, w);
  for (const m of meals) {
    for (const d of m.dishes)
      for (const l of d.lines) {
        l.held = false;
        if (m.free && !l.locked) l.grams = roundGrams(l.grams, roundingFor(l.src, l.role)).grams;
      }
  }
}

// ---------- building and reading ----------

function workLine(src: FoodLineSource, grams = src.grams, locked = false): WLine {
  const role = lineRole(src);
  const b = lineBounds(src, role);
  return { src, role, min: b.min, max: b.max, grams, locked, held: false };
}

function fromGramMeal(m: GramMeal, free: boolean): WMeal {
  return {
    target: m.target,
    free,
    dishes: m.dishes.map((d) => ({ recipeId: d.recipeId, lines: d.lines.map((l) => ({ ...workLine(l.src, l.grams, l.locked) })) })),
  };
}

function toGramLine(l: WLine): GramLine {
  const rounded = roundGrams(l.grams, roundingFor(l.src, l.role));
  return { src: l.src, role: l.role, grams: rounded.grams, units: rounded.units, locked: l.locked, shown: shownMacros(l.src.per100g, rounded.grams) };
}

function toGramMeal(slot: DietSlot, m: WMeal): GramMeal {
  const dishes = m.dishes.map((d) => {
    const lines = d.lines.map(toGramLine);
    return { recipeId: d.recipeId, lines, totals: lines.reduce((a, l) => addShown(a, l.shown), ZERO_SHOWN) };
  });
  return { slot, target: m.target, dishes, totals: dishes.reduce((a, d) => addShown(a, d.totals), ZERO_SHOWN) };
}

function toGramDay(slots: readonly DietSlot[], meals: WMeal[], target: MacroTargets, ds: DietSettings): GramDay {
  const out = meals.map((m, i) => toGramMeal(slots[i] ?? { label: 'meal', kind: 'lunch', time: '12:00', sharePercent: 0 }, m));
  const totals = out.reduce((a, m) => addShown(a, m.totals), ZERO_SHOWN);
  return { target, meals: out, totals, check: checkMacros(totals, target, ds) };
}

/** Sums of shown values; meal and day totals are rebuilt from these after any change. */
export function sumLines(lines: readonly GramLine[]): ShownMacros {
  return lines.reduce((a, l) => addShown(a, l.shown), ZERO_SHOWN);
}

export function mealTarget(day: MacroTargets, sharePercent: number): MacroTargets {
  const k = sharePercent / 100;
  return { kcal: day.kcal * k, proteinG: day.proteinG * k, carbG: day.carbG * k, fatG: day.fatG * k };
}

// ---------- choosing dishes ----------

const hash = (s: string): number => {
  let h = 17;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100_003;
  return h;
};

const asDietRecipe = (r: GramRecipe) => ({ id: r.id, tags: r.tags, perServing: lineTotals(r.lines) });

function lineTotals(lines: readonly FoodLineSource[]) {
  let kcal = 0;
  let proteinG = 0;
  let carbG = 0;
  let fatG = 0;
  for (const l of lines) {
    kcal += (l.per100g.kcal * l.grams) / 100;
    proteinG += (l.per100g.proteinG * l.grams) / 100;
    carbG += (l.per100g.carbG * l.grams) / 100;
    fatG += (l.per100g.fatG * l.grams) / 100;
  }
  return { kcal, proteinG, carbG, fatG };
}

/** Roles a dish really brings (a role counts when its foods give at least a tenth of the dish's calories). */
export function dishRoles(lines: readonly FoodLineSource[]): Set<LineRole> {
  const kcal = lineTotals(lines).kcal;
  const byRole = new Map<LineRole, number>();
  for (const l of lines) {
    const role = lineRole(l);
    byRole.set(role, (byRole.get(role) ?? 0) + (l.per100g.kcal * l.grams) / 100);
  }
  const out = new Set<LineRole>();
  for (const [role, k] of byRole) if (role !== 'fixed' && kcal > 0 && k / kcal >= 0.1) out.add(role);
  return out;
}

/** The single role a side dish fills: veg for salads and vegetable sides, else its biggest calorie source. */
function sideRole(r: GramRecipe): LineRole | 'veg' {
  if (r.tags.includes(DIET_TAGS.salad)) return 'veg';
  const byRole = new Map<LineRole, number>();
  for (const l of r.lines) {
    const role = lineRole(l);
    byRole.set(role, (byRole.get(role) ?? 0) + (l.per100g.kcal * l.grams) / 100);
  }
  let best: LineRole = 'fixed';
  let top = -1;
  for (const [role, k] of byRole)
    if (k > top) {
      best = role;
      top = k;
    }
  return best === 'fixed' ? 'veg' : best;
}

const hasVeg = (lines: readonly FoodLineSource[]) => lines.some((l) => lineRole(l) === 'fixed' && l.grams >= 60 && l.per100g.kcal < 60);

interface Pool {
  mains: GramRecipe[];
  sides: GramRecipe[];
}

function usablePool(book: readonly GramRecipe[], opts: GramPlanOptions): Pool {
  const ok = book.filter((r) => r.lines.length > 0 && !opts.exclude?.has(r.id) && (!opts.vegetarian || r.tags.includes(DIET_TAGS.vegetarian)));
  return { mains: ok.filter((r) => !isSide(asDietRecipe(r))), sides: ok.filter((r) => isSide(asDietRecipe(r))) };
}

const fitsKind = (r: GramRecipe, kind: MealKind) => recipeKinds(asDietRecipe(r)).includes(kind);

/** Main dishes for a slot: only recipes tagged for it (untagged ones are guessed from their calories). */
export function mainsForKind(pool: readonly GramRecipe[], kind: MealKind): GramRecipe[] {
  return pool.filter((r) => fitsKind(r, kind));
}

/** Sides that complete a main dish for its slot: a carb, a protein and (lunch/dinner) a salad when missing. */
function sidesFor(main: GramRecipe, kind: MealKind, sides: readonly GramRecipe[], style: DietStyle | undefined, salt: number): GramRecipe[] {
  if (kind === 'snack') return [];
  const roles = dishRoles(main.lines);
  const wanted: (LineRole | 'veg')[] = [];
  if (!roles.has('protein')) wanted.push('protein');
  if (!roles.has('carb') && style !== 'low_carb') wanted.push('carb');
  if ((kind === 'lunch' || kind === 'dinner') && !hasVeg(main.lines)) wanted.push('veg');
  const out: GramRecipe[] = [];
  for (const role of wanted) {
    let best: GramRecipe | undefined;
    let bestKey = Infinity;
    for (const s of sides) {
      if (s.id === main.id || !fitsKind(s, kind) || sideRole(s) !== role) continue;
      const key = (hash(s.id) + salt * 7) % 1000;
      if (key < bestKey) {
        best = s;
        bestKey = key;
      }
    }
    if (best) out.push(best);
  }
  return out;
}

function buildMeal(dishes: readonly GramRecipe[], target: MacroTargets): WMeal {
  return { target, free: true, dishes: dishes.map((d) => ({ recipeId: d.id, lines: d.lines.map((l) => workLine(l)) })) };
}

/** How far a meal stays from its target after a meal-only solve (0 = exact), in calorie terms. */
function mealMiss(m: WMeal): number {
  solve([m], m.target, MEAL_WEIGHTS);
  const s = { k: 0, p: 0, c: 0, f: 0 };
  for (const d of m.dishes)
    for (const l of d.lines) {
      s.k += valueOf(l, 'kcal');
      s.p += valueOf(l, 'proteinG');
      s.c += valueOf(l, 'carbG');
      s.f += valueOf(l, 'fatG');
    }
  const t = m.target;
  const scale = Math.max(t.kcal, 100);
  return (Math.abs(s.k - t.kcal) + 0.5 * (4 * Math.abs(s.p - t.proteinG) + 4 * Math.abs(s.c - t.carbG) + 9 * Math.abs(s.f - t.fatG))) / scale;
}

/**
 * The foods a dish is "about": its protein foods, or its biggest calorie source when it has none. Used to avoid
 * cottage cheese at the snack and again at dinner on the same day.
 */
export function keyFoods(r: Pick<GramRecipe, 'lines'>): string[] {
  const roles = r.lines.map((l) => ({ l, role: lineRole(l), kcal: (l.per100g.kcal * l.grams) / 100 }));
  const protein = roles.filter((x) => x.role === 'protein').map((x) => x.l.name);
  if (protein.length > 0) return protein;
  const top = roles.filter((x) => x.role !== 'fixed').sort((a, b) => b.kcal - a.kcal)[0];
  return top ? [top.l.name] : [];
}

/** Score added when a dish repeats a key food already eaten today (soft: a much better fit still wins). */
const REPEAT_PENALTY = 0.35;

function pickMain(
  pool: Pool,
  kind: MealKind,
  target: MacroTargets,
  opts: GramPlanOptions,
  avoid: ReadonlySet<string>,
  salt: number,
  eatenToday: ReadonlySet<string> = new Set(),
): { main: GramRecipe; sides: GramRecipe[] } | null {
  const all = mainsForKind(pool.mains, kind);
  const fallback = all.length > 0 ? all : pool.mains;
  const fresh = fallback.filter((r) => !avoid.has(r.id));
  const choices = fresh.length > 0 ? fresh : fallback;
  let best: { main: GramRecipe; sides: GramRecipe[] } | null = null;
  let bestScore = Infinity;
  for (const r of choices) {
    const sides = sidesFor(r, kind, pool.sides, opts.style, salt);
    const miss = mealMiss(buildMeal([r, ...sides], target));
    const jitter = ((hash(r.id) + salt) % 100) / 100;
    const repeats = keyFoods(r).some((f) => eatenToday.has(f)) ? REPEAT_PENALTY : 0;
    const score = miss + jitter * 0.18 - goalBonus(asDietRecipe(r), opts.goal, opts.style) + sides.length * 0.04 + repeats - (opts.boost?.get(r.id) ?? 0);
    if (score < bestScore) {
      best = { main: r, sides };
      bestScore = score;
    }
  }
  return best;
}

// ---------- public planning ----------

export interface GramDayContext extends GramPlanOptions {
  slots: readonly DietSlot[];
  dayIndex: number;
  /** Main dishes to avoid (yesterday's). */
  recent: ReadonlySet<string>;
}

/**
 * One day in exact grams: a fitting main dish per slot (plus the carb, protein or salad side it lacks), then
 * the protein, carb and fat foods of every meal are scaled together so each meal hits its share of the calories
 * and the day hits protein, carbs and fat. Grams are rounded per food; totals are sums of what is shown.
 */
export function planGramDay(book: readonly GramRecipe[], target: MacroTargets, ctx: GramDayContext, ds: DietSettings): GramDay {
  const pool = usablePool(book, ctx);
  const used = new Set<string>();
  const eaten = new Set<string>();
  const targets = mealTargets(target, ctx.slots);
  const meals: WMeal[] = ctx.slots.map((slot, i) => {
    const t = targets[i] ?? mealTarget(target, slot.sharePercent);
    const avoid = new Set([...ctx.recent, ...used]);
    const pick = pickMain(pool, slot.kind, t, ctx, avoid, ctx.dayIndex * 31 + i * 17, eaten);
    if (!pick) return { target: t, free: true, dishes: [] };
    used.add(pick.main.id);
    for (const f of keyFoods(pick.main)) eaten.add(f);
    return buildMeal([pick.main, ...pick.sides], t);
  });
  solveAndRound(meals, target, PLAN_WEIGHTS);
  return toGramDay(ctx.slots, meals, target, ds);
}

export interface GramWeekOptions extends GramPlanOptions {
  schedule: DietSchedule;
  mealsPerDay: MealsPerDay;
  days: number;
  seed?: number;
  /** The trainer's own meal layout (shares, carb weights); else the schedule's default. */
  slots?: readonly DietSlot[];
  /** Targets per day (carb cycling); a missing day uses `target`. */
  dayTargets?: readonly MacroTargets[];
}

/** Consecutive days; each day avoids the previous day's main dishes. */
export function planGramWeek(book: readonly GramRecipe[], target: MacroTargets, opts: GramWeekOptions, ds: DietSettings): GramDay[] {
  const slots = opts.slots ?? slotsFor(opts.schedule, opts.mealsPerDay, ds);
  const out: GramDay[] = [];
  let recent: ReadonlySet<string> = new Set();
  for (let d = 0; d < opts.days; d++) {
    const day = planGramDay(book, opts.dayTargets?.[d] ?? target, { ...opts, slots, dayIndex: d + (opts.seed ?? 0) * 7, recent }, ds);
    out.push(day);
    recent = new Set(day.meals.flatMap((m) => (m.dishes[0] ? [m.dishes[0].recipeId] : [])));
  }
  return out;
}

// ---------- edits ----------

function rebuild(day: GramDay, mealIndex: number | null, change: (meals: WMeal[]) => void, ds: DietSettings, target = day.target, slots?: readonly DietSlot[]): GramDay {
  const layout = slots && slots.length === day.meals.length ? slots : day.meals.map((m) => m.slot);
  const fresh = target !== day.target || slots !== undefined;
  const aims = fresh ? mealTargets(target, layout) : [];
  const meals = day.meals.map((m, i) => fromGramMeal(fresh ? { ...m, slot: layout[i] ?? m.slot, target: aims[i] ?? m.target } : m, mealIndex === null || i === mealIndex));
  change(meals);
  solveAndRound(meals, target, mealIndex === null ? PLAN_WEIGHTS : MEAL_WEIGHTS);
  return toGramDay(
    layout,
    meals,
    target,
    ds,
  );
}

export interface LineRef {
  meal: number;
  dish: number;
  line: number;
}

const lineAt = (meals: WMeal[], ref: LineRef) => meals[ref.meal]?.dishes[ref.dish]?.lines[ref.line];

/**
 * The trainer sets one food's grams: it is rounded to the food's step, locked, and the meal's other free foods
 * re-balance so the meal stays on its calories. Other meals do not move.
 */
export function setLineGrams(day: GramDay, ref: LineRef, grams: number, ds: DietSettings): GramDay {
  return rebuild(
    day,
    ref.meal,
    (meals) => {
      const l = lineAt(meals, ref);
      if (!l || !(grams > 0)) return;
      l.grams = roundGrams(grams, roundingFor(l.src, l.role)).grams;
      l.locked = true;
    },
    ds,
  );
}

/** Locks or unlocks a food; unlocking hands it back to the solver. */
export function toggleLineLock(day: GramDay, ref: LineRef, ds: DietSettings): GramDay {
  return rebuild(
    day,
    ref.meal,
    (meals) => {
      const l = lineAt(meals, ref);
      if (l) l.locked = !l.locked;
    },
    ds,
  );
}

/** How much one tap on + or − moves a food: one unit (or half a loaf), 1 g of oil, 5 g of nuts, 10 g otherwise. */
export function nudgeStep(line: Pick<GramLine, 'src' | 'role'>): number {
  const r = roundingFor(line.src, line.role);
  if (r.unitG !== undefined) return r.unitG * (r.unitStep ?? 1);
  if (line.src.category === 'fats') return 1;
  if (r.step === 1) return 5;
  return 10;
}

/**
 * Keeps dishes and hand-set foods but aims the whole day at new targets (the trainer moved a parameter), and
 * optionally a new meal split (same number of meals).
 */
export function retargetDay(day: GramDay, target: MacroTargets, ds: DietSettings, slots?: readonly DietSlot[]): GramDay {
  return rebuild(day, null, () => undefined, ds, target, slots);
}

/** Dishes that may replace one dish of a meal: same slot, mains for a main and same-role sides for a side. */
export function dishAlternatives(book: readonly GramRecipe[], day: GramDay, mealIndex: number, dishIndex: number, opts: GramPlanOptions, limit: number): { recipeId: string; kcal: number }[] {
  const meal = day.meals[mealIndex];
  const current = meal?.dishes[dishIndex];
  if (!meal || !current) return [];
  const pool = usablePool(book, opts);
  const currentRecipe = book.find((r) => r.id === current.recipeId);
  const inMeal = new Set(meal.dishes.map((d) => d.recipeId));
  const side = currentRecipe ? isSide(asDietRecipe(currentRecipe)) : dishIndex > 0;
  const role = currentRecipe && side ? sideRole(currentRecipe) : null;
  const candidates = side ? pool.sides.filter((s) => fitsKind(s, meal.slot.kind) && (role === null || sideRole(s) === role)) : mainsForKind(pool.mains, meal.slot.kind);
  const scored = candidates
    .filter((r) => !inMeal.has(r.id))
    .map((r) => {
      const w = fromGramMeal(meal, true);
      w.dishes[dishIndex] = { recipeId: r.id, lines: r.lines.map((l) => workLine(l)) };
      const miss = mealMiss(w);
      const kcal = w.dishes.reduce((a, d) => a + d.lines.reduce((b, l) => b + valueOf(l, 'kcal'), 0), 0);
      return { recipeId: r.id, kcal: Math.round(kcal), score: miss - goalBonus(asDietRecipe(r), opts.goal, opts.style) - (opts.boost?.get(r.id) ?? 0) };
    });
  scored.sort((a, b) => a.score - b.score || a.recipeId.localeCompare(b.recipeId));
  return scored.slice(0, Math.max(0, limit)).map(({ recipeId, kcal }) => ({ recipeId, kcal }));
}

/** Puts another dish in place of one dish of a meal and re-balances that meal. */
export function swapDish(day: GramDay, book: readonly GramRecipe[], mealIndex: number, dishIndex: number, recipeId: string, ds: DietSettings): GramDay {
  const recipe = book.find((r) => r.id === recipeId);
  if (!recipe) return day;
  return rebuild(
    day,
    mealIndex,
    (meals) => {
      const m = meals[mealIndex];
      if (m && m.dishes[dishIndex]) m.dishes[dishIndex] = { recipeId, lines: recipe.lines.map((l) => workLine(l)) };
    },
    ds,
  );
}
