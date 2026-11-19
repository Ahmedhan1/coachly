import { describe, expect, it } from 'vitest';
import {
  applyKcalFloor,
  defaultDietSettings,
  defaultNutritionSettings,
  dietNoteKeys,
  dietPlanTargets,
  dietWarnings,
  goalDefaults,
  isSide,
  planWeek,
  slotAlternatives,
  type DietRecipe,
} from '..';

const DS = defaultDietSettings();
const S = defaultNutritionSettings();
const KPG = S.kcalPerGram;
const r = (id: string, tags: string[], kcal: number, p: number, c: number, f: number): DietRecipe => ({ id, tags, perServing: { kcal, proteinG: p, carbG: c, fatG: f } });

describe('diet safety', () => {
  it('lifts calories to the floor and gives the extra to carbs', () => {
    const t = { kcal: 1000, proteinG: 100, carbG: 50, fatG: 40 };
    const { targets, lifted } = applyKcalFloor(t, 1200, KPG);
    expect(lifted).toBe(true);
    expect(targets.kcal).toBe(1200);
    expect(targets.proteinG * 4 + targets.carbG * 4 + targets.fatG * 9).toBeCloseTo(1200);
    expect(applyKcalFloor(t, 900, KPG).lifted).toBe(false);
  });

  it('warns about low calories, low protein, low fat, very low carbs and extreme changes', () => {
    const input = { sex: 'female' as const, weightKg: 60, tdee: 1800, goal: 'cut' as const };
    const w = dietWarnings({ kcal: 1000, proteinG: 50, carbG: 20, fatG: 20 }, input, DS);
    expect(w).toEqual(expect.arrayContaining(['kcal_floor', 'protein_low', 'fat_low', 'carb_very_low', 'deficit_deep']));
    expect(dietWarnings({ kcal: 1500, proteinG: 120, carbG: 150, fatG: 50 }, input, DS)).toEqual([]);
    expect(dietWarnings({ kcal: 3000, proteinG: 150, carbG: 400, fatG: 90 }, { sex: 'male', weightKg: 80, tdee: 2400, goal: 'bulk' }, DS)).toContain('surplus_high');
  });
});

describe('goal defaults and plan targets', () => {
  it('start from the trainer calculator settings and stay in their ranges', () => {
    for (const goal of ['cut', 'maintain', 'bulk', 'recomp'] as const) {
      const d = goalDefaults(goal, S, DS);
      expect(d.proteinPerKg).toBeGreaterThanOrEqual(S.proteinPerKgRange.min);
      expect(d.proteinPerKg).toBeLessThanOrEqual(S.proteinPerKgRange.max);
    }
    expect(goalDefaults('cut', S, DS).percent).toBe(S.defaultGoalPercent.cut);
    expect(goalDefaults('maintain', S, DS).percent).toBe(0);
  });

  it('turns a saved burn into targets and flags a deep cut', () => {
    const saved = { tdee: 2500, input: { sex: 'male' as const, weightKg: 80 } };
    const d = goalDefaults('cut', S, DS);
    const res = dietPlanTargets({ saved, goal: 'cut', style: 'balanced', percent: d.percent, proteinPerKg: d.proteinPerKg, fatPerKg: d.fatPerKg }, S, DS);
    expect(res.targets.kcal).toBe(2000);
    expect(res.warnings).toEqual([]);
    const deep = dietPlanTargets({ saved, goal: 'cut', style: 'balanced', percent: 40, proteinPerKg: d.proteinPerKg, fatPerKg: d.fatPerKg }, S, DS);
    expect(deep.warnings).toContain('deficit_deep');
    const floored = dietPlanTargets({ saved: { tdee: 1300, input: { sex: 'female', weightKg: 55 } }, goal: 'cut', style: 'balanced', percent: 25, proteinPerKg: 1.8, fatPerKg: 0.6 }, S, DS);
    expect(floored.floored).toBe(true);
    expect(floored.targets.kcal).toBe(DS.minKcalFemale);
  });
});

describe('vegetarian and side handling', () => {
  const book: DietRecipe[] = [
    r('veg_b', ['فطار', 'نباتي'], 350, 15, 45, 12),
    r('meat_b', ['فطار'], 350, 25, 20, 18),
    r('veg_l', ['غدا', 'نباتي'], 550, 20, 80, 14),
    r('meat_l', ['غدا'], 550, 40, 50, 18),
    r('veg_d', ['عشا', 'نباتي'], 400, 22, 40, 16),
    r('rice', ['غدا', 'عشا', 'جانبي', 'نباتي'], 200, 4, 44, 0.5),
    r('salad', ['سلطات', 'غدا'], 60, 2, 8, 3),
  ];

  it('plans only vegetarian dishes when asked', () => {
    const week = planWeek(book, { kcal: 1800, proteinG: 100, carbG: 220, fatG: 60 }, { goal: 'maintain', schedule: 'normal', mealsPerDay: 3, days: 3, vegetarian: true }, DS);
    const used = week.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.recipeId)));
    expect(used.every((id) => ['veg_b', 'veg_l', 'veg_d', 'rice'].includes(id))).toBe(true);
  });

  it('never makes a side or salad the main dish, and treats both as sides', () => {
    expect(isSide(book[5] as DietRecipe)).toBe(true);
    expect(isSide(book[6] as DietRecipe)).toBe(true);
    const week = planWeek(book, { kcal: 2200, proteinG: 130, carbG: 260, fatG: 70 }, { goal: 'maintain', schedule: 'normal', mealsPerDay: 3, days: 4 }, DS);
    for (const d of week) for (const m of d.meals) expect(['rice', 'salad']).not.toContain(m.items[0]?.recipeId);
  });

  it('offers nothing outside the vegetarian set as a swap', () => {
    const alts = slotAlternatives(book, { kcal: 550, proteinG: 30, carbG: 60, fatG: 18 }, 'lunch', 'maintain', DS, null, 5, { vegetarian: true });
    expect(alts.map((a) => a.recipeId)).not.toContain('meat_l');
  });
});

describe('notes', () => {
  it('gives each goal its own practical notes', () => {
    expect(dietNoteKeys('cut', 'balanced', 'normal')).toEqual(expect.arrayContaining(['water', 'cutRefeed', 'cutDietBreak']));
    expect(dietNoteKeys('bulk', 'balanced', 'normal')).toContain('bulkSurplus');
    expect(dietNoteKeys('recomp', 'high_protein', 'normal')).toContain('recompProtein');
  });
});

describe('recomputeDay', () => {
  it('re-adds a day after a swap and re-checks it', async () => {
    const { recomputeDay, checkMacros: check } = await import('..');
    const book = [r('a', ['غدا'], 500, 40, 50, 15), r('b', ['غدا'], 300, 20, 30, 10)];
    const slot = { label: 'lunch' as const, kind: 'lunch' as const, time: '14:00', sharePercent: 100 };
    const target = { kcal: 500, proteinG: 40, carbG: 50, fatG: 15 };
    const day = recomputeDay([{ slot, items: [{ recipeId: 'b', servings: 2 }] }], book, target, DS);
    expect(day.totals.kcal).toBe(600);
    expect(day.check).toEqual(check(day.totals, target, DS));
    expect(recomputeDay([{ slot, items: [{ recipeId: 'gone', servings: 1 }] }], book, target, DS).totals.kcal).toBe(0);
  });
});
