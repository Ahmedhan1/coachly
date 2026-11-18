import { describe, expect, it } from 'vitest';
import {
  DIET_TAGS,
  defaultDietSettings,
  gramRecipe,
  isSide,
  keyFoods,
  planGramWeek,
  recipeKinds,
  type DietGoal,
  type GramRecipe,
  type MacroTargets,
  type MealsPerDay,
} from '@/domain/meals';
import { starterFoodRenames, starterIngredients, starterRecipeSources, starterRecipes } from './starter';

const table = starterIngredients();
const sources = starterRecipeSources();
const SLOT_TAGS: readonly string[] = [DIET_TAGS.breakfast, DIET_TAGS.lunch, DIET_TAGS.dinner, DIET_TAGS.snack];

/** kcal ≈ 4P + 4C + 9F within 15 %; with fibre counted at 2 kcal/g when the label carbs include it; ±10 kcal for very light foods. */
function plausible(p: { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG?: number }): boolean {
  const band = Math.max(p.kcal * 0.15, 10);
  const plain = 4 * p.proteinG + 4 * p.carbG + 9 * p.fatG;
  const fib = p.fiberG ?? 0;
  const withFibre = 4 * p.proteinG + 4 * Math.max(0, p.carbG - fib) + 2 * fib + 9 * p.fatG;
  return Math.abs(plain - p.kcal) <= band || Math.abs(withFibre - p.kcal) <= band;
}

describe('cookbook data', () => {
  it('has at least 200 recipes, each with ingredients from the food table and at least one meal slot', () => {
    expect(sources.length).toBeGreaterThanOrEqual(200);
    const ids = new Set(table.map((f) => f.id));
    for (const r of sources) {
      for (const item of r.items) expect(ids.has(item.ingredient), `${r.id} → ${item.ingredient}`).toBe(true);
      expect(r.tags.some((t) => SLOT_TAGS.includes(t)), `${r.id} has no slot`).toBe(true);
    }
  });

  it('every food has plausible values per 100 g', () => {
    // Vinegar's few calories come from acetic acid, which is neither protein, carbs nor fat.
    const acid = new Set(['vinegar']);
    for (const f of table) if (!acid.has(f.id)) expect(plausible(f.per100g), `${f.id} ${JSON.stringify(f.per100g)}`).toBe(true);
  });

  it('is balanced across slots and goals', () => {
    const count = (tag: string) => sources.filter((r) => r.tags.includes(tag) && !r.tags.includes(DIET_TAGS.side)).length;
    for (const tag of SLOT_TAGS) expect(count(tag), tag).toBeGreaterThanOrEqual(45);
    expect(count(DIET_TAGS.cut)).toBeGreaterThanOrEqual(40);
    expect(count(DIET_TAGS.bulk)).toBeGreaterThanOrEqual(40);
    expect(count(DIET_TAGS.vegetarian)).toBeGreaterThanOrEqual(40);
  });

  it('every food and recipe has an English name; new recipes have short English steps', () => {
    for (const f of table) expect(f.nameEn, f.id).toBeTruthy();
    for (const r of sources) {
      expect(r.nameEn, r.id).toBeTruthy();
      expect(r.instructionsEn, r.id).toBeTruthy();
      expect((r.instructionsEn ?? '').length, r.id).toBeLessThan(300);
    }
  });

  it('says raw or cooked in the name of meats, fish and starches that change weight', () => {
    const must = ['chicken_breast', 'beef_lean', 'beef_mince_lean', 'tilapia', 'salmon', 'shrimp', 'potato', 'rice_cooked', 'pasta_cooked', 'oats'];
    for (const id of must) expect(table.find((f) => f.id === id)?.name, id).toMatch(/ني|مطبوخ|مطبوخة|ناشف|مسلوق|مشوي/);
    expect(Object.keys(starterFoodRenames())).toContain('chicken_breast');
  });

  it('eggs and loaves are counted foods with their unit weight', () => {
    expect(table.find((f) => f.id === 'egg')?.unitG).toBe(50);
    expect(table.find((f) => f.id === 'baladi_bread')).toMatchObject({ unitG: 90, unitHalf: true });
  });

  it('never puts heavy cooked meals in the snack slot or fish-and-rice at breakfast', () => {
    const snackForbidden = ['koshari', 'healthy_koshari', 'tilapia_sayadia', 'fatta_light', 'chicken_basmati'];
    for (const id of snackForbidden) expect(sources.find((r) => r.id === id)?.tags, id).not.toContain(DIET_TAGS.snack);
    const breakfastForbidden = ['tilapia_sayadia', 'mackerel_rice', 'fish_tagine_rice', 'garlic_shrimp_rice', 'koshari'];
    for (const id of breakfastForbidden) expect(sources.find((r) => r.id === id)?.tags, id).not.toContain(DIET_TAGS.breakfast);
  });
});

describe('gram planner on the real cookbook', () => {
  const book: GramRecipe[] = starterRecipes(table).map((r) => gramRecipe({ id: r.key, servings: r.servings, tags: r.tags, ingredients: r.ingredients }, table));
  const ds = defaultDietSettings();
  const byId = new Map(book.map((r) => [r.id, r]));
  const targets: Record<DietGoal, MacroTargets> = {
    cut: { kcal: 1900, proteinG: 170, carbG: 170, fatG: 60 },
    maintain: { kcal: 2500, proteinG: 150, carbG: 300, fatG: 75 },
    bulk: { kcal: 3100, proteinG: 160, carbG: 410, fatG: 90 },
    recomp: { kcal: 2300, proteinG: 180, carbG: 230, fatG: 70 },
  };

  for (const goal of ['cut', 'maintain', 'bulk', 'recomp'] as const) {
    for (const mealsPerDay of [3, 4, 5] as MealsPerDay[]) {
      it(`${goal}, ${mealsPerDay} meals: days land on target, slots fit, fast`, () => {
        const t0 = performance.now();
        const week = planGramWeek(book, targets[goal], { goal, schedule: 'normal', mealsPerDay, days: 7 }, ds);
        const perDay = (performance.now() - t0) / 7;
        expect(perDay).toBeLessThan(50);
        const ok = week.filter((d) => d.check.ok).length;
        expect(ok, `${goal}/${mealsPerDay}: ${week.map((d) => `${d.totals.kcal}/${d.totals.proteinG}`).join(' ')}`).toBeGreaterThanOrEqual(6);
        for (const d of week)
          for (const m of d.meals) {
            const main = byId.get(m.dishes[0]?.recipeId ?? '');
            expect(main, m.slot.label).toBeDefined();
            if (!main) continue;
            const kinds = recipeKinds({ id: main.id, tags: main.tags, perServing: { kcal: 300, proteinG: 0, carbG: 0, fatG: 0 } });
            expect(kinds, `${main.id} in ${m.slot.kind}`).toContain(m.slot.kind);
            expect(isSide({ id: main.id, tags: main.tags, perServing: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 } })).toBe(false);
          }
      });
    }
  }

  it('rarely repeats the same key food (e.g. cottage cheese) in two meals of one day', () => {
    let days = 0;
    let repeated = 0;
    for (const goal of ['cut', 'maintain', 'bulk', 'recomp'] as const)
      for (const mealsPerDay of [3, 4, 5] as MealsPerDay[]) {
        for (const d of planGramWeek(book, targets[goal], { goal, schedule: 'normal', mealsPerDay, days: 7 }, ds)) {
          days += 1;
          const foods = d.meals.flatMap((m) => keyFoods(byId.get(m.dishes[0]?.recipeId ?? '') ?? { lines: [] }));
          if (new Set(foods).size < foods.length) repeated += 1;
        }
      }
    expect(repeated / days, `${repeated} of ${days} days repeat a key food`).toBeLessThan(0.2);
  });

  it('Ramadan and fasting layouts also plan', () => {
    for (const schedule of ['ramadan', 'if_16_8'] as const) {
      const week = planGramWeek(book, targets.maintain, { goal: 'maintain', schedule, mealsPerDay: 4, days: 7 }, ds);
      expect(week.filter((d) => d.check.ok).length, schedule).toBeGreaterThanOrEqual(6);
    }
  });

  it('vegetarian low-carb still plans on calories', () => {
    const week = planGramWeek(book, { kcal: 2000, proteinG: 130, carbG: 100, fatG: 115 }, { goal: 'cut', style: 'low_carb', vegetarian: true, schedule: 'normal', mealsPerDay: 4, days: 7 }, ds);
    for (const d of week) expect(Math.abs(d.totals.kcal - 2000) / 2000).toBeLessThan(0.08);
  });
});
