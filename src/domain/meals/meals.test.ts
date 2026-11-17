import { describe, expect, it } from 'vitest';
import {
  ageInYears,
  buildRecipeRows,
  calcSteps,
  calculate,
  compareToTarget,
  dayTotals,
  defaultFormulaFor,
  defaultNutritionSettings,
  duplicateMeals,
  macroShares,
  moveMeal,
  nextDayNumber,
  parseNutritionSettings,
  parseSavedCalculation,
  replaceItem,
  rowsToItems,
  settingsProblems,
  storedRecipeNutrition,
  swapCandidates,
  toSavedCalculation,
  type CalcInput,
  type IngredientEntry,
} from '.';

const S = defaultNutritionSettings();

const base: CalcInput = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  bodyFatPercent: null,
  formula: 'mifflin-st-jeor',
  activity: 'moderate',
  goal: 'cut',
  goalPercent: 20,
  proteinPerKg: 2,
  fatPerKg: 0.8,
};

describe('calculate', () => {
  it('matches a hand-computed Mifflin chain', () => {
    // BMR = 10×80 + 6.25×180 − 5×30 + 5 = 1780; TDEE = 1780×1.55 = 2759; cut 20 % = 2207.2
    const r = calculate(base, S);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.bmr).toBe(1780);
    expect(r.value.tdee).toBeCloseTo(2759, 6);
    expect(r.value.targetKcal).toBeCloseTo(2207.2, 6);
    // protein 160 g = 640 kcal, fat 64 g = 576 kcal, carbs (2207.2−1216)/4 = 247.8 g
    expect(r.value.macros.proteinG).toBe(160);
    expect(r.value.macros.fatG).toBeCloseTo(64, 6);
    expect(r.value.macros.carbG).toBeCloseTo(247.8, 6);
    expect(r.value.water).toEqual({ minMl: 2400, maxMl: 2800 });
    expect(r.value.bmi).toBeCloseTo(24.69, 2);
    expect(r.value.leanMassKg).toBeNull();
  });

  it('uses Katch-McArdle with body fat and the trainer coefficients', () => {
    // LBM = 80 × 0.8 = 64; BMR = 370 + 21.6×64 = 1752.4
    const r = calculate({ ...base, formula: 'katch-mcardle', bodyFatPercent: 20, goal: 'maintain' }, S);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.bmr).toBeCloseTo(1752.4, 6);
    expect(r.value.targetKcal).toBeCloseTo(r.value.tdee, 6);
    expect(r.value.leanMassKg).toBeCloseTo(64, 6);
    const custom = { ...S, katchMcArdle: { base: 400, perKgLbm: 20 } };
    const c = calculate({ ...base, formula: 'katch-mcardle', bodyFatPercent: 20 }, custom);
    expect(c.ok && c.value.bmr).toBe(1680);
  });

  it('returns domain errors instead of numbers', () => {
    expect(calculate({ ...base, weightKg: 0 }, S)).toEqual({ ok: false, error: 'invalid_weight' });
    expect(calculate({ ...base, ageYears: 12 }, S)).toEqual({ ok: false, error: 'invalid_age' });
    expect(calculate({ ...base, formula: 'katch-mcardle' }, S)).toEqual({ ok: false, error: 'missing_body_fat' });
    expect(calculate({ ...base, goalPercent: 40 }, S)).toEqual({ ok: false, error: 'goal_percent_out_of_range' });
    expect(calculate({ ...base, proteinPerKg: 4 }, S)).toEqual({ ok: false, error: 'protein_out_of_range' });
    expect(calculate({ ...base, formula: 'katch-mcardle', bodyFatPercent: 20, ageYears: 10 }, S)).toEqual({ ok: false, error: 'invalid_age' });
  });

  it('describes the steps with the numbers used', () => {
    const r = calculate(base, S);
    if (!r.ok) throw new Error(r.error);
    const steps = calcSteps(base, r.value, S);
    expect(steps.map((s) => s.id)).toEqual(['bmr_mifflin', 'tdee', 'target', 'protein', 'fat', 'carb', 'water', 'bmi']);
    expect(steps[0]?.expression).toBe('10 × 80 + 6.25 × 180 − 5 × 30 + 5');
    expect(steps[2]?.expression).toBe('2759 × (1 − 20%)');
    const female = calculate({ ...base, sex: 'female' }, S);
    if (!female.ok) throw new Error(female.error);
    expect(calcSteps({ ...base, sex: 'female' }, female.value, S)[0]?.expression.endsWith('− 161')).toBe(true);
    const k = calculate({ ...base, formula: 'katch-mcardle', bodyFatPercent: 20 }, S);
    if (!k.ok) throw new Error(k.error);
    expect(calcSteps({ ...base, formula: 'katch-mcardle', bodyFatPercent: 20 }, k.value, S).slice(0, 2).map((s) => s.id)).toEqual(['lbm', 'bmr_katch']);
  });

  it('round-trips a saved calculation', () => {
    const r = calculate(base, S);
    if (!r.ok) throw new Error(r.error);
    const saved = toSavedCalculation(base, r.value, calcSteps(base, r.value, S), 1000);
    expect(saved.targetKcal).toBe(2207);
    expect(saved.carbG).toBe(248);
    expect(parseSavedCalculation(saved)).toEqual(saved);
    expect(parseSavedCalculation({ nope: 1 })).toBeNull();
  });
});

describe('macroShares / defaultFormulaFor', () => {
  it('shares sum to 1 and handle zero', () => {
    const s = macroShares({ proteinKcal: 600, carbKcal: 1000, fatKcal: 400 });
    expect(s.protein + s.carb + s.fat).toBeCloseTo(1, 9);
    expect(s.carb).toBe(0.5);
    expect(macroShares({ proteinKcal: 0, carbKcal: 0, fatKcal: 0 })).toEqual({ protein: 0, carb: 0, fat: 0 });
  });
  it('prefers Katch when body fat is known, never without it', () => {
    expect(defaultFormulaFor(18, S)).toBe('katch-mcardle');
    expect(defaultFormulaFor(undefined, S)).toBe('mifflin-st-jeor');
    expect(defaultFormulaFor(18, { ...S, preferKatchWhenBodyFat: false })).toBe('mifflin-st-jeor');
    expect(defaultFormulaFor(null, { ...S, defaultFormula: 'katch-mcardle' })).toBe('mifflin-st-jeor');
  });
});

describe('settings', () => {
  it('falls back to defaults for invalid data and merges partial data', () => {
    expect(parseNutritionSettings(undefined)).toEqual(S);
    expect(parseNutritionSettings({ activityFactors: 'x' })).toEqual(S);
    expect(parseNutritionSettings({ targetTolerancePercent: 8 }).targetTolerancePercent).toBe(8);
  });
  it('flags defaults outside their slider ranges', () => {
    expect(settingsProblems(S)).toEqual([]);
    expect(settingsProblems({ ...S, defaultGoalPercent: { cut: 40, bulk: 10 } })).toEqual(['default_goal_outside_range']);
    expect(settingsProblems({ ...S, defaultProteinPerKg: 3 })).toEqual(['default_macro_outside_range']);
  });
});

describe('ageInYears', () => {
  it('counts whole years', () => {
    expect(ageInYears('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageInYears('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageInYears(null, '2026-01-01')).toBeNull();
    expect(ageInYears('2030-01-01', '2026-01-01')).toBeNull();
  });
});

const TABLE: IngredientEntry[] = [
  { id: 'rice', name: 'رز', per100g: { kcal: 130, proteinG: 2.7, carbG: 28.2, fatG: 0.3 } },
  { id: 'oil', name: 'زيت', per100g: { kcal: 884, proteinG: 0, carbG: 0, fatG: 100 } },
];

describe('recipes', () => {
  it('builds rows from the table and sums them back through recipeMacros', () => {
    const rows = buildRecipeRows([{ ingredientId: 'rice', grams: 200 }, { ingredientId: 'oil', grams: 10 }], TABLE);
    if (!rows.ok) throw new Error(rows.error);
    expect(rows.value[0]).toEqual({ name: 'رز', quantity: 200, unit: 'g', kcal: 260, proteinG: 5.4, carbsG: 56.4, fatG: 0.6 });
    const n = storedRecipeNutrition({ servings: 2, ingredients: rows.value });
    if (!n.ok) throw new Error(n.error);
    expect(n.value.total.kcal).toBeCloseTo(348.4, 6);
    expect(n.value.perServing.kcal).toBeCloseTo(174.2, 6);
    expect(n.value.incomplete).toBe(false);
  });
  it('rejects unknown ingredients and flags missing values', () => {
    expect(buildRecipeRows([{ ingredientId: 'x', grams: 1 }], TABLE)).toEqual({ ok: false, error: 'unknown_ingredient' });
    const n = storedRecipeNutrition({ servings: 1, ingredients: [{ quantity: 100, kcal: null, proteinG: 1, carbsG: 1, fatG: 1 }] });
    expect(n.ok && n.value.incomplete).toBe(true);
    expect(storedRecipeNutrition({ servings: 0, ingredients: [] })).toEqual({ ok: false, error: 'invalid_servings' });
  });
  it('maps rows back to table items by name', () => {
    expect(rowsToItems([{ name: 'رز', quantity: 50 }, { name: 'ملح', quantity: 1 }], TABLE)).toEqual({
      items: [{ ingredientId: 'rice', grams: 50 }],
      unknown: ['ملح'],
    });
  });
});

describe('meal totals', () => {
  const lookup = new Map([
    ['a', { kcal: 300, proteinG: 20, carbG: 30, fatG: 10 }],
    ['b', { kcal: 150, proteinG: 5, carbG: 25, fatG: 3 }],
  ]);
  it('sums servings across meals and counts free text as uncounted', () => {
    const r = dayTotals(
      [
        { items: [{ recipeId: 'a', text: '', servings: 1.5 }] },
        { items: [{ recipeId: 'b', text: '', servings: 2 }, { recipeId: null, text: 'شاي', servings: 1 }] },
      ],
      lookup,
    );
    expect(r.totals).toEqual({ kcal: 750, proteinG: 40, carbG: 95, fatG: 21 });
    expect(r.uncounted).toBe(1);
  });
  it('compares to target with a tolerance band', () => {
    expect(compareToTarget(2000, 2100, 5).status).toBe('on');
    expect(compareToTarget(1800, 2100, 5)).toMatchObject({ status: 'under', diffKcal: -300 });
    expect(compareToTarget(2400, 2100, 5).status).toBe('over');
    expect(compareToTarget(2400, null, 5).status).toBe('no_target');
  });
});

describe('plan editing', () => {
  const meals = [
    { id: 'm1', name: 'فطار', time: null, items: [{ recipeId: 'a', text: '', servings: 1 }] },
    { id: 'm2', name: 'غدا', time: '14:00', items: [{ recipeId: 'b', text: '', servings: 1 }] },
  ];
  it('duplicates with fresh ids and deep-copied items', () => {
    let n = 0;
    const copy = duplicateMeals(meals, () => `n${++n}`);
    expect(copy.map((m) => m.id)).toEqual(['n1', 'n2']);
    expect(copy[0]?.items).toEqual(meals[0]?.items);
    expect(copy[0]?.items[0]).not.toBe(meals[0]?.items[0]);
  });
  it('moves and replaces', () => {
    expect(moveMeal(meals, 1, 0).map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(moveMeal(meals, 5, 0).map((m) => m.id)).toEqual(['m1', 'm2']);
    const swapped = replaceItem(meals, 'm2', 0, { recipeId: 'c', text: '', servings: 2 });
    expect(swapped[1]?.items[0]?.recipeId).toBe('c');
    expect(meals[1]?.items[0]?.recipeId).toBe('b');
  });
  it('orders swap candidates by calorie distance', () => {
    const all = [
      { recipeId: 'x', perServing: { kcal: 500, proteinG: 0, carbG: 0, fatG: 0 } },
      { recipeId: 'y', perServing: { kcal: 310, proteinG: 0, carbG: 0, fatG: 0 } },
      { recipeId: 'z', perServing: { kcal: 280, proteinG: 0, carbG: 0, fatG: 0 } },
      { recipeId: 'self', perServing: { kcal: 300, proteinG: 0, carbG: 0, fatG: 0 } },
    ];
    expect(swapCandidates(all, 300, 'self').map((c) => c.recipeId)).toEqual(['y', 'z', 'x']);
  });
  it('numbers new days', () => {
    expect(nextDayNumber([])).toBe(1);
    expect(nextDayNumber([1, null, 3])).toBe(4);
  });
});
