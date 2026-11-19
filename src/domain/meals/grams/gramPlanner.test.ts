import { describe, expect, it } from 'vitest';
import {
  defaultDietSettings,
  dishAlternatives,
  lineBounds,
  lineRole,
  nudgeStep,
  planGramDay,
  planGramWeek,
  retargetDay,
  roundGrams,
  roundingFor,
  setLineGrams,
  shownMacros,
  slotsFor,
  sumLines,
  swapDish,
  toggleLineLock,
  type FoodLineSource,
  type GramDay,
  type GramRecipe,
  type MacroTargets,
} from '..';

const DS = defaultDietSettings();

const food = (name: string, grams: number, kcal: number, p: number, c: number, f: number, extra: Partial<FoodLineSource> = {}): FoodLineSource => ({
  name,
  grams,
  per100g: { kcal, proteinG: p, carbG: c, fatG: f },
  ...extra,
});

const chicken = (g: number) => food('صدر فراخ ني', g, 120, 22.5, 0, 2.6, { category: 'poultry' });
const rice = (g: number) => food('رز أبيض مطبوخ', g, 130, 2.7, 28, 0.3, { category: 'grains' });
const oil = (g: number) => food('زيت زيتون', g, 884, 0, 0, 100, { category: 'fats' });
const salad = (g: number) => food('سلطة خضرا', g, 18, 1, 3.5, 0.2, { category: 'veg' });
const egg = (g: number) => food('بيض', g, 143, 12.6, 0.7, 9.5, { category: 'eggs', unitG: 50, unitLabel: 'بيضة' });
const bread = (g: number) => food('عيش بلدي', g, 266, 9, 55, 1.5, { category: 'grains', unitG: 90, unitHalf: true });
const foul = (g: number) => food('فول مدمس مطبوخ', g, 110, 7.6, 19.7, 0.4, { category: 'legumes' });
const oats = (g: number) => food('شوفان', g, 389, 16.9, 66, 6.9, { category: 'grains' });
const milk = (g: number) => food('لبن خالي الدسم', g, 34, 3.4, 5, 0.1, { category: 'dairy' });
const whey = (g: number) => food('واي بروتين', g, 400, 80, 8, 6, { category: 'protein' });
const banana = (g: number) => food('موز', g, 89, 1.1, 22.8, 0.3, { category: 'fruit' });
const almonds = (g: number) => food('لوز', g, 579, 21, 22, 50, { category: 'nuts' });
const fish = (g: number) => food('سمك بلطي ني', g, 96, 20, 0, 1.7, { category: 'fish' });
const cumin = (g: number) => food('كمون', g, 375, 17.8, 44.2, 22.3, { category: 'condiments' });

const BOOK: GramRecipe[] = [
  { id: 'eggs_bread', tags: ['فطار'], lines: [egg(100), bread(90), salad(80), oil(5)] },
  { id: 'foul', tags: ['فطار', 'نباتي'], lines: [foul(200), oil(10), cumin(2), bread(45)] },
  { id: 'oats', tags: ['فطار', 'نباتي'], lines: [oats(50), milk(250), banana(80)] },
  { id: 'chicken_rice', tags: ['غدا', 'عشا'], lines: [chicken(180), rice(200), oil(8), salad(100)] },
  { id: 'fish_rice', tags: ['غدا'], lines: [fish(250), rice(150), oil(10), salad(100)] },
  { id: 'chicken_salad', tags: ['عشا'], lines: [chicken(150), salad(150), oil(8)] },
  { id: 'whey_banana', tags: ['سناك'], lines: [whey(30), banana(100), milk(200)] },
  { id: 'almonds', tags: ['سناك'], lines: [almonds(28)] },
  { id: 'rice_side', tags: ['غدا', 'عشا', 'جانبي'], lines: [rice(150)] },
  { id: 'salad_side', tags: ['غدا', 'عشا', 'سلطات', 'جانبي'], lines: [salad(200), oil(5)] },
];

const TARGET: MacroTargets = { kcal: 2400, proteinG: 170, carbG: 260, fatG: 75 };
const slots4 = slotsFor('normal', 4, DS);
const ctx = { goal: 'maintain' as const, slots: slots4, dayIndex: 0, recent: new Set<string>() };

const allLines = (d: GramDay) => d.meals.flatMap((m) => m.dishes.flatMap((x) => x.lines));

describe('food lines', () => {
  it('finds the lever each food is for', () => {
    expect(lineRole(chicken(150))).toBe('protein');
    expect(lineRole(egg(100))).toBe('protein');
    expect(lineRole(rice(150))).toBe('carb');
    expect(lineRole(foul(200))).toBe('carb');
    expect(lineRole(oil(10))).toBe('fat');
    expect(lineRole(almonds(28))).toBe('fat');
    expect(lineRole(salad(150))).toBe('fixed');
    expect(lineRole(cumin(2))).toBe('fixed');
  });

  it('rounds 5 g for most foods, 1 g for oils/nuts/whey, whole eggs and half loaves', () => {
    expect(roundGrams(173, roundingFor(rice(150), 'carb'))).toEqual({ grams: 175, units: null });
    expect(roundGrams(7.4, roundingFor(oil(10), 'fat'))).toEqual({ grams: 7, units: null });
    expect(roundGrams(33.6, roundingFor(whey(30), 'protein'))).toEqual({ grams: 34, units: null });
    expect(roundGrams(130, roundingFor(egg(100), 'protein'))).toEqual({ grams: 150, units: 3 });
    expect(roundGrams(120, roundingFor(bread(90), 'carb'))).toEqual({ grams: 135, units: 1.5 });
    expect(roundGrams(1, roundingFor(egg(100), 'protein'))).toEqual({ grams: 50, units: 1 });
  });

  it('keeps gram bounds sane and around the recipe amount', () => {
    expect(lineBounds(oil(10), 'fat').max).toBeLessThanOrEqual(25);
    expect(lineBounds(whey(30), 'protein').max).toBeLessThanOrEqual(60);
    const b = lineBounds(chicken(150), 'protein');
    expect(b.min).toBeLessThanOrEqual(150);
    expect(b.max).toBeGreaterThanOrEqual(150);
    expect(lineBounds(salad(150), 'fixed')).toEqual({ min: 150, max: 150 });
  });

  it('shows integer values computed from the grams', () => {
    expect(shownMacros(rice(0).per100g, 175)).toEqual({ kcal: 228, proteinG: 5, carbG: 49, fatG: 1 });
  });
});

describe('planGramDay', () => {
  const day = planGramDay(BOOK, TARGET, ctx, DS);

  it('lands on calories and protein within the tolerance', () => {
    expect(Math.abs(day.totals.kcal - TARGET.kcal) / TARGET.kcal).toBeLessThanOrEqual(DS.kcalTolerancePercent / 100);
    expect(day.totals.proteinG).toBeGreaterThanOrEqual(TARGET.proteinG * (1 - DS.macroTolerancePercent / 100));
    expect(day.check.ok).toBe(true);
  });

  it('meal and day totals are exactly the sums of the shown items', () => {
    for (const m of day.meals) {
      const lines = m.dishes.flatMap((d) => d.lines);
      expect(m.totals).toEqual(sumLines(lines));
      for (const d of m.dishes) expect(d.totals).toEqual(sumLines(d.lines));
    }
    expect(day.totals).toEqual(sumLines(allLines(day)));
    for (const l of allLines(day)) expect(l.shown).toEqual(shownMacros(l.src.per100g, l.grams));
  });

  it('every gram amount sits on its rounding grid', () => {
    for (const l of allLines(day)) {
      const r = roundingFor(l.src, l.role);
      if (r.unitG) expect(l.units! * r.unitG).toBe(l.grams);
      else expect(l.grams % r.step).toBe(0);
    }
  });

  it('puts only slot-fitting dishes in each slot', () => {
    const kinds = day.meals.map((m) => [m.slot.kind, m.dishes.map((d) => d.recipeId)] as const);
    for (const [kind, ids] of kinds) {
      for (const id of ids) {
        const tags = BOOK.find((r) => r.id === id)?.tags ?? [];
        const want = { breakfast: 'فطار', lunch: 'غدا', dinner: 'عشا', snack: 'سناك' }[kind];
        expect(tags).toContain(want);
      }
    }
  });

  it('meals sit near their share of the calories', () => {
    for (const m of day.meals) expect(Math.abs(m.totals.kcal - m.target.kcal)).toBeLessThan(m.target.kcal * 0.2);
  });

  it('is deterministic', () => {
    expect(planGramDay(BOOK, TARGET, ctx, DS)).toEqual(day);
  });

  it('is fast (< 50 ms per day)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) planGramDay(BOOK, TARGET, { ...ctx, dayIndex: i }, DS);
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });

  it('follows the targets when they move', () => {
    const small = planGramDay(BOOK, { kcal: 1800, proteinG: 150, carbG: 170, fatG: 55 }, ctx, DS);
    expect(Math.abs(small.totals.kcal - 1800) / 1800).toBeLessThanOrEqual(0.05);
  });

  it('respects vegetarian and exclusions', () => {
    const veg = planGramDay(BOOK, TARGET, { ...ctx, vegetarian: true }, DS);
    for (const m of veg.meals) for (const d of m.dishes) expect(BOOK.find((r) => r.id === d.recipeId)?.tags).toContain('نباتي');
    const ex = planGramDay(BOOK, TARGET, { ...ctx, exclude: new Set(['chicken_rice']) }, DS);
    expect(ex.meals.flatMap((m) => m.dishes.map((d) => d.recipeId))).not.toContain('chicken_rice');
  });
});

describe('planGramWeek', () => {
  it('plans the requested days and varies the main dishes', () => {
    const week = planGramWeek(BOOK, TARGET, { goal: 'cut', schedule: 'normal', mealsPerDay: 4, days: 7 }, DS);
    expect(week).toHaveLength(7);
    const lunches = new Set(week.map((d) => d.meals[1]?.dishes[0]?.recipeId));
    expect(lunches.size).toBeGreaterThan(1);
  });
});

describe('edits', () => {
  const day = planGramDay(BOOK, TARGET, ctx, DS);
  const lunch = 1;
  const proteinLine = day.meals[lunch]!.dishes[0]!.lines.findIndex((l) => l.role === 'protein');

  it('setting one food locks it and re-balances the rest of the meal', () => {
    const before = day.meals[lunch]!;
    const ref = { meal: lunch, dish: 0, line: proteinLine };
    const grams = before.dishes[0]!.lines[proteinLine]!.grams + 80;
    const next = setLineGrams(day, ref, grams, DS);
    const line = next.meals[lunch]!.dishes[0]!.lines[proteinLine]!;
    expect(line.locked).toBe(true);
    expect(line.grams).toBe(grams);
    expect(Math.abs(next.meals[lunch]!.totals.kcal - before.target.kcal)).toBeLessThan(before.target.kcal * 0.1);
    // Other meals untouched; day totals follow.
    expect(next.meals[0]).toEqual(day.meals[0]);
    expect(next.totals).toEqual(sumLines(allLines(next)));
    // Unlocking hands it back.
    const unlocked = toggleLineLock(next, ref, DS);
    expect(unlocked.meals[lunch]!.dishes[0]!.lines[proteinLine]!.locked).toBe(false);
  });

  it('a locked food survives a new target', () => {
    const ref = { meal: lunch, dish: 0, line: proteinLine };
    const locked = setLineGrams(day, ref, 200, DS);
    const moved = retargetDay(locked, { kcal: 2000, proteinG: 160, carbG: 200, fatG: 60 }, DS);
    expect(moved.meals[lunch]!.dishes[0]!.lines[proteinLine]!.grams).toBe(200);
    expect(Math.abs(moved.totals.kcal - 2000) / 2000).toBeLessThan(0.06);
  });

  it('swaps offer only dishes for the same slot and keep the meal on target', () => {
    const alts = dishAlternatives(BOOK, day, lunch, 0, { goal: 'maintain' }, 5);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(BOOK.find((r) => r.id === a.recipeId)?.tags).toContain('غدا');
    const first = alts[0]!;
    const swapped = swapDish(day, BOOK, lunch, 0, first.recipeId, DS);
    expect(swapped.meals[lunch]!.dishes[0]!.recipeId).toBe(first.recipeId);
    expect(Math.abs(swapped.meals[lunch]!.totals.kcal - day.meals[lunch]!.target.kcal)).toBeLessThan(day.meals[lunch]!.target.kcal * 0.15);
  });

  it('nudges by a unit, a gram of oil, or 10 g', () => {
    expect(nudgeStep({ src: egg(100), role: 'protein' })).toBe(50);
    expect(nudgeStep({ src: bread(90), role: 'carb' })).toBe(45);
    expect(nudgeStep({ src: oil(10), role: 'fat' })).toBe(1);
    expect(nudgeStep({ src: rice(150), role: 'carb' })).toBe(10);
  });
});
