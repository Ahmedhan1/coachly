import { describe, expect, it } from 'vitest';
import { defaultDietSettings, defaultNutritionSettings, defaultTargetWeight, goalDiet, type GoalDietInput } from '.';

const S = defaultNutritionSettings();
const DS = defaultDietSettings();
const input: GoalDietInput = {
  body: { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 70, bodyFatPercent: 15, activityFactor: 1.55 },
  goal: 'bulk',
  targetWeightKg: 73,
  weeks: 24,
  experience: 'beginner',
  proteinPerKg: null,
};

describe('goal diet (planner + personal macros, trainer settings)', () => {
  it('bulk: surplus from the lean-gain model, protein by training age, macros add up to the calories', () => {
    const g = goalDiet(input, S, DS);
    expect(g.plan.dailyDeltaKcal).toBeCloseTo(((3 / 24) * DS.kcalPerKgGain) / 7, 6);
    expect(g.targets.kcal).toBe(Math.round(g.plan.kcal));
    expect(g.macros.reason).toBe('bulk');
    const kpg = S.kcalPerGram;
    expect(g.targets.proteinG * kpg.protein + g.targets.fatG * kpg.fat + g.targets.carbG * kpg.carb).toBeCloseTo(g.targets.kcal, 6);
  });

  it('the protein slider overrides g/kg; carbs give way, calories stay', () => {
    const g = goalDiet({ ...input, proteinPerKg: 2.5 }, S, DS);
    expect(g.targets.proteinG).toBeCloseTo(2.5 * 70, 6);
    expect(g.macros.perKg).toBe(2.5);
    expect(g.targets.kcal).toBe(goalDiet(input, S, DS).targets.kcal);
  });

  it('trainer settings drive it: a smaller gain energy means a smaller surplus', () => {
    const lower = goalDiet(input, S, { ...DS, kcalPerKgGain: 4000 });
    expect(lower.plan.dailyDeltaKcal).toBeLessThan(goalDiet(input, S, DS).plan.dailyDeltaKcal);
  });

  it('default target follows the goal', () => {
    expect(defaultTargetWeight('cut', 80)).toBe(at(80));
    expect(defaultTargetWeight('bulk', 70)).toBe(73);
    expect(goalDiet({ ...input, targetWeightKg: null, goal: 'maintain' }, S, DS).targetWeightKg).toBe(70);
  });
});

function at(w: number) {
  return Math.round(w * 0.94 * 2) / 2;
}
