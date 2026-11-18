import { describe, expect, it } from 'vitest';
import { gramRecipe, savedDish, type GramDish, type IngredientEntry } from '.';

const table: IngredientEntry[] = [
  { id: 'egg', name: 'بيض', nameEn: 'Egg', per100g: { kcal: 143, proteinG: 12.6, carbG: 0.7, fatG: 9.5 }, category: 'eggs', portions: [{ label: 'بيضة', labelEn: 'egg', grams: 50 }], unitG: 50 },
];

describe('gramRecipe', () => {
  it('turns stored rows into per-serving foods with values per 100 g, enriched from the food table', () => {
    const r = gramRecipe(
      {
        id: 'r1',
        servings: 2,
        tags: ['فطار'],
        ingredients: [
          { name: 'بيض', quantity: 200, unit: 'g', kcal: 286, proteinG: 25.2, carbsG: 1.4, fatG: 19 },
          { name: 'ملح', quantity: 2, unit: 'g', kcal: null, proteinG: null, carbsG: null, fatG: null },
        ],
      },
      table,
    );
    expect(r.lines[0]).toEqual({
      foodId: 'egg',
      name: 'بيض',
      nameEn: 'Egg',
      grams: 100,
      per100g: { kcal: 143, proteinG: 12.6, carbG: 0.7, fatG: 9.5 },
      category: 'eggs',
      unitG: 50,
      unitLabel: 'بيضة',
      unitLabelEn: 'egg',
    });
    expect(r.lines[1]?.per100g.kcal).toBe(0);
  });
});

describe('savedDish', () => {
  it('keeps the exact lines and an equivalent servings number for older readers', () => {
    const src = { name: 'بيض', nameEn: 'Egg', grams: 100, per100g: { kcal: 143, proteinG: 12.6, carbG: 0.7, fatG: 9.5 }, unitG: 50, unitLabel: 'بيضة' };
    const dish: GramDish = {
      recipeId: 'r1',
      lines: [{ src, role: 'protein', grams: 150, units: 3, locked: false, shown: { kcal: 215, proteinG: 19, carbG: 1, fatG: 14 } }],
      totals: { kcal: 215, proteinG: 19, carbG: 1, fatG: 14 },
    };
    expect(savedDish(dish, 143)).toEqual({
      recipeId: 'r1',
      servings: 1.5,
      lines: [{ name: 'بيض', nameEn: 'Egg', grams: 150, units: 3, unitLabel: 'بيضة', kcal: 215, proteinG: 19, carbG: 1, fatG: 14 }],
    });
  });
});
