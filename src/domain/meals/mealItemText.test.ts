import { describe, expect, it } from 'vitest';
import { mealItemRows, mealItemText } from '.';

const units = { g: 'جم', kcal: 'سعر' };

describe('mealItemText', () => {
  it('lists every food with its exact grams and the calories when the item has gram lines', () => {
    const item = {
      recipeId: 'r',
      text: '',
      servings: 1.3,
      lines: [
        { name: 'صدر فراخ ني', nameEn: 'Chicken breast, raw', grams: 180, kcal: 216 },
        { name: 'بيض', nameEn: 'Egg', grams: 100, units: 2, unitLabel: 'بيضة', unitLabelEn: 'egg', kcal: 143 },
      ],
    };
    expect(mealItemText(item, { name: 'فراخ', units })).toBe('فراخ: صدر فراخ ني 180 جم، بيض 100 جم (2 بيضة) (359 سعر)');
    expect(mealItemText(item, { name: 'Chicken', units: { g: 'g', kcal: 'kcal' }, english: true })).toBe('Chicken: Chicken breast, raw 180 g, Egg 100 g (2 egg) (359 kcal)');
  });

  it('keeps the older "name × servings" text', () => {
    expect(mealItemText({ recipeId: 'r', text: '', servings: 2 }, { name: 'فول', units })).toBe('فول × 2');
    expect(mealItemText({ recipeId: null, text: 'تفاحة', servings: 1 }, { name: '', units })).toBe('تفاحة');
  });
});

describe('mealItemRows', () => {
  it('splits a gram-planned item into the dish line and one line per food', () => {
    const item = { recipeId: 'r', text: '', servings: 1, lines: [{ name: 'رز أبيض مطبوخ', grams: 150, kcal: 195 }, { name: 'بيض', grams: 100, units: 2, unitLabel: 'بيضة', kcal: 143 }] };
    expect(mealItemRows(item, { name: 'رز وبيض', units })).toEqual(['رز وبيض (338 سعر)', '• رز أبيض مطبوخ 150 جم', '• بيض 100 جم (2 بيضة)']);
    expect(mealItemRows({ recipeId: null, text: 'شاي', servings: 1 }, { name: '', units })).toEqual(['شاي']);
  });
});
