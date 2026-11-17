import { describe, expect, it } from 'vitest';
import { recipeMacros, type Ingredient } from './recipe';

const table: Ingredient[] = [
  { id: 'foul', per100g: { kcal: 110, proteinG: 7.6, carbG: 19.6, fatG: 0.4 } },
  { id: 'oil', per100g: { kcal: 884, proteinG: 0, carbG: 0, fatG: 100 } },
  { id: 'bread', per100g: { kcal: 250, proteinG: 9, carbG: 50, fatG: 1.5 } },
];

describe('recipeMacros', () => {
  it('foul with oil and bread, 2 servings', () => {
    // foul 300 g: kcal 330, P 22.8, C 58.8, F 1.2
    // oil 10 g:   kcal 88.4, P 0,   C 0,    F 10
    // bread 200 g: kcal 500, P 18,  C 100,  F 3
    // total: kcal 918.4, P 40.8, C 158.8, F 14.2 ; per serving /2: 459.2, 20.4, 79.4, 7.1
    const r = recipeMacros(
      [
        { ingredientId: 'foul', grams: 300 },
        { ingredientId: 'oil', grams: 10 },
        { ingredientId: 'bread', grams: 200 },
      ],
      table,
      2,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalGrams).toBe(510);
    expect(r.value.total.kcal).toBeCloseTo(918.4, 9);
    expect(r.value.total.proteinG).toBeCloseTo(40.8, 9);
    expect(r.value.total.carbG).toBeCloseTo(158.8, 9);
    expect(r.value.total.fatG).toBeCloseTo(14.2, 9);
    expect(r.value.perServing.kcal).toBeCloseTo(459.2, 9);
    expect(r.value.perServing.proteinG).toBeCloseTo(20.4, 9);
    expect(r.value.perServing.carbG).toBeCloseTo(79.4, 9);
    expect(r.value.perServing.fatG).toBeCloseTo(7.1, 9);
  });

  it('empty recipe is all zeros', () => {
    const r = recipeMacros([], table, 1);
    expect(r.ok && r.value.total).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
  });

  it('errors', () => {
    expect(recipeMacros([{ ingredientId: 'nope', grams: 10 }], table, 1)).toEqual({ ok: false, error: 'unknown_ingredient' });
    expect(recipeMacros([{ ingredientId: 'oil', grams: -1 }], table, 1)).toEqual({ ok: false, error: 'invalid_grams' });
    expect(recipeMacros([], table, 0)).toEqual({ ok: false, error: 'invalid_servings' });
    expect(recipeMacros([], table, 1.5)).toEqual({ ok: false, error: 'invalid_servings' });
    const bad: Ingredient[] = [{ id: 'x', per100g: { kcal: Number.NaN, proteinG: 0, carbG: 0, fatG: 0 } }];
    expect(recipeMacros([{ ingredientId: 'x', grams: 1 }], bad, 1)).toEqual({ ok: false, error: 'invalid_ingredient_values' });
  });
});
