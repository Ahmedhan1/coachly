import { describe, expect, it } from 'vitest';
import {
  applySplit,
  cycleDayTypes,
  cycleTargets,
  dayFiber,
  defaultDietSettings,
  fiberTarget,
  fillRatio,
  planGramWeek,
  retargetDay,
  slotsFor,
  weekShopping,
  type FoodLineSource,
  type GramRecipe,
  type MacroTargets,
} from '.';

const DS = defaultDietSettings();
const food = (foodId: string, grams: number, kcal: number, p: number, c: number, f: number, extra: Partial<FoodLineSource> = {}): FoodLineSource => ({
  foodId,
  name: foodId,
  grams,
  per100g: { kcal, proteinG: p, carbG: c, fatG: f },
  ...extra,
});
const chicken = (g: number) => food('chicken', g, 120, 22.5, 0, 2.6, { category: 'poultry' });
const rice = (g: number) => food('rice', g, 130, 2.7, 28, 0.3, { category: 'grains', fiberPer100g: 0.4 });
const oil = (g: number) => food('oil', g, 884, 0, 0, 100, { category: 'fats' });
const egg = (g: number) => food('egg', g, 143, 12.6, 0.7, 9.5, { category: 'eggs', unitG: 50, unitLabel: 'بيضة' });
const bread = (g: number) => food('bread', g, 266, 9, 55, 1.5, { category: 'grains', unitG: 90, unitHalf: true, fiberPer100g: 6 });
const foul = (g: number) => food('foul', g, 110, 7.6, 19.7, 0.4, { category: 'legumes', fiberPer100g: 5.4 });
const whey = (g: number) => food('whey', g, 400, 80, 8, 6, { category: 'protein' });
const banana = (g: number) => food('banana', g, 89, 1.1, 22.8, 0.3, { category: 'fruit', fiberPer100g: 2.6 });

const BOOK: GramRecipe[] = [
  { id: 'eggs_bread', tags: ['فطار'], lines: [egg(100), bread(90), oil(5)] },
  { id: 'foul', tags: ['فطار'], lines: [foul(200), oil(10), bread(45)] },
  { id: 'chicken_rice', tags: ['غدا', 'عشا'], lines: [chicken(180), rice(200), oil(8)] },
  { id: 'chicken_rice2', tags: ['غدا', 'عشا'], lines: [chicken(150), rice(250), oil(5)] },
  { id: 'whey_banana', tags: ['سناك'], lines: [whey(30), banana(100)] },
];
const BASE: MacroTargets = { kcal: 2400, proteinG: 170, carbG: 260, fatG: 75 };
const KPG = { protein: 4, carb: 4, fat: 9 };

describe('calorie control in the week planner', () => {
  it('follows per-day targets (carb cycling): training days plan more calories than rest days', () => {
    const cyc = cycleTargets(BASE, cycleDayTypes(7, [0, 2, 4], null), { trainingExtraKcal: 400, refeedKcal: 2800 }, KPG);
    const week = planGramWeek(BOOK, BASE, { goal: 'maintain', schedule: 'normal', mealsPerDay: 4, days: 7, dayTargets: cyc.days }, DS);
    expect(week[0]?.target.kcal).toBe(cyc.days[0]?.kcal);
    expect(week[0]?.totals.kcal ?? 0).toBeGreaterThan((week[1]?.totals.kcal ?? 0) + 150);
  });

  it('uses the trainer’s meal split (bigger breakfast plans a bigger breakfast)', () => {
    const slots = applySplit(slotsFor('normal', 4, DS), [40, 30, 10, 20], null);
    const [day] = planGramWeek(BOOK, BASE, { goal: 'maintain', schedule: 'normal', mealsPerDay: 4, days: 1, slots }, DS);
    expect(day?.meals[0]?.target.kcal).toBeCloseTo(960, 6);
    expect(day?.meals[0]?.totals.kcal ?? 0).toBeGreaterThan((day?.meals[2]?.totals.kcal ?? 0) * 2);
  });

  it('retargets an edited day onto a new split without losing its dishes', () => {
    const [day] = planGramWeek(BOOK, BASE, { goal: 'maintain', schedule: 'normal', mealsPerDay: 4, days: 1 }, DS);
    if (!day) throw new Error('no day');
    const slots = applySplit(slotsFor('normal', 4, DS), [20, 40, 15, 25], '16:00');
    const next = retargetDay(day, BASE, DS, slots);
    expect(next.meals.map((m) => m.dishes[0]?.recipeId)).toEqual(day.meals.map((m) => m.dishes[0]?.recipeId));
    expect(next.meals[1]?.slot.sharePercent).toBe(40);
    expect(next.meals[1]?.target.kcal).toBeCloseTo(960, 6);
  });

  it('fibre, fibre target, bar ratios and the week shopping list', () => {
    const week = planGramWeek(BOOK, BASE, { goal: 'maintain', schedule: 'normal', mealsPerDay: 4, days: 2 }, DS);
    const d0 = week[0];
    if (!d0) throw new Error('no day');
    expect(dayFiber(d0)).toBeGreaterThan(0);
    expect(fiberTarget(2000)).toBe(28);
    expect(fillRatio(50, 100)).toBe(0.5);
    expect(fillRatio(500, 100)).toBe(1.5);
    expect(fillRatio(5, 0)).toBe(0);
    const list = weekShopping(week);
    const rows = week.flatMap((d) => d.meals.flatMap((m) => m.dishes.flatMap((x) => x.lines)));
    const chickenTotal = rows.filter((l) => l.src.foodId === 'chicken').reduce((a, l) => a + l.grams, 0);
    const chickenRow = list.find((l) => l.foodId === 'chicken');
    expect(Math.abs((chickenRow?.grams ?? 0) - chickenTotal)).toBeLessThanOrEqual(25);
    const eggs = list.find((l) => l.foodId === 'egg');
    if (eggs) expect(eggs.units).toBe(rows.filter((l) => l.src.foodId === 'egg').reduce((a, l) => a + (l.units ?? 0), 0));
    expect(list[0]?.grams ?? 0).toBeGreaterThanOrEqual(list[list.length - 1]?.grams ?? 0);
  });

  it('stays fast: a 7-day, 5-meal week plans in well under a second', () => {
    const t0 = performance.now();
    planGramWeek(BOOK, BASE, { goal: 'cut', schedule: 'normal', mealsPerDay: 5, days: 7 }, DS);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('meal options (trainer or client picks)', () => {
  it('offers the planned meal plus other main dishes, each re-balanced to the meal target', async () => {
    const { mealOptions, withMealOption } = await import('.');
    const [day] = planGramWeek(BOOK, BASE, { goal: 'maintain', schedule: 'normal', mealsPerDay: 4, days: 1 }, DS);
    if (!day) throw new Error('no day');
    const lunch = day.meals.findIndex((m) => m.slot.kind === 'lunch');
    const opts = mealOptions(BOOK, day, lunch, { goal: 'maintain' }, DS, 3);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0]?.recipeId).toBe(day.meals[lunch]?.dishes[0]?.recipeId);
    expect(new Set(opts.map((o) => o.recipeId)).size).toBe(opts.length);
    for (const o of opts) {
      const t = o.meal.target.kcal;
      expect(Math.abs(o.meal.totals.kcal - t) / t).toBeLessThan(0.15);
    }
    const second = opts[1];
    if (!second) throw new Error('no option');
    const next = withMealOption(day, lunch, second, DS);
    expect(next.meals[lunch]?.dishes[0]?.recipeId).toBe(second.recipeId);
    expect(next.totals.kcal).toBe(next.meals.reduce((a, m) => a + m.totals.kcal, 0));
  });
});
