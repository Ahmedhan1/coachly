import { describe, expect, it } from 'vitest';
import { defaultDietSettings, defaultNutritionSettings, dietPlanTargets, planWeek, storedRecipeNutrition, type DietRecipe, type DietStyle } from '@/domain/meals';
import { starterIngredients, starterRecipes } from './starter';

const DS = defaultDietSettings();
const S = defaultNutritionSettings();

function book(): DietRecipe[] {
  const table = starterIngredients();
  return starterRecipes(table).map((r) => {
    const n = storedRecipeNutrition(r);
    if (!n.ok) throw new Error(r.key);
    return { id: r.key, tags: r.tags, perServing: n.value.perServing };
  });
}

describe('planner on the real starter recipe book', () => {
  const cases: { name: string; tdee: number; weightKg: number; sex: 'male' | 'female'; goal: 'cut' | 'bulk' | 'maintain' | 'recomp'; style: DietStyle; meals: 3 | 4 | 5; schedule: 'normal' | 'if_16_8' | 'ramadan'; vegetarian?: boolean }[] = [
    { name: 'man cutting, 4 meals', tdee: 2700, weightKg: 85, sex: 'male', goal: 'cut', style: 'balanced', meals: 4, schedule: 'normal' },
    { name: 'woman cutting, 3 meals', tdee: 2000, weightKg: 65, sex: 'female', goal: 'cut', style: 'balanced', meals: 3, schedule: 'normal' },
    { name: 'man bulking, 5 meals', tdee: 2800, weightKg: 75, sex: 'male', goal: 'bulk', style: 'balanced', meals: 5, schedule: 'normal' },
    { name: 'recomp high protein', tdee: 2500, weightKg: 80, sex: 'male', goal: 'recomp', style: 'high_protein', meals: 4, schedule: 'normal' },
    { name: 'low carb maintain', tdee: 2300, weightKg: 70, sex: 'male', goal: 'maintain', style: 'low_carb', meals: 4, schedule: 'normal' },
    { name: 'intermittent fasting cut', tdee: 2600, weightKg: 82, sex: 'male', goal: 'cut', style: 'balanced', meals: 3, schedule: 'if_16_8' },
    { name: 'ramadan maintain', tdee: 2400, weightKg: 78, sex: 'male', goal: 'maintain', style: 'balanced', meals: 3, schedule: 'ramadan' },
    { name: 'vegetarian cut', tdee: 2200, weightKg: 68, sex: 'female', goal: 'cut', style: 'balanced', meals: 4, schedule: 'normal', vegetarian: true },
  ];
  for (const c of cases) {
    it(`hits calories within tolerance every day: ${c.name}`, () => {
      const saved = { tdee: c.tdee, input: { sex: c.sex, weightKg: c.weightKg } };
      const { targets } = dietPlanTargets({ saved, goal: c.goal, style: c.style, percent: c.goal === 'cut' ? 20 : c.goal === 'bulk' ? 10 : 0, proteinPerKg: c.goal === 'cut' ? 2.2 : 2, fatPerKg: 0.8 }, S, DS);
      const week = planWeek(book(), targets, { goal: c.goal, schedule: c.schedule, mealsPerDay: c.meals, days: 7, style: c.style, vegetarian: c.vegetarian }, DS);
      expect(week).toHaveLength(7);
      for (const d of week) {
        expect(d.meals.every((m) => m.items.length > 0)).toBe(true);
        expect(d.check.kcal, `kcal ${Math.round(d.totals.kcal)} vs ${targets.kcal}`).toBe('on');
        expect(d.check.protein, `protein ${Math.round(d.totals.proteinG)} vs ${Math.round(targets.proteinG)}`).not.toBe('under');
      }
    });
  }

  it('has at least 60 recipes beyond the original 36, all with computed macros', () => {
    expect(starterRecipes().length).toBeGreaterThanOrEqual(96);
  });
});
