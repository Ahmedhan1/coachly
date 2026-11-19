import { describe, expect, it } from 'vitest';
import { CATEGORY_ICONS, DEFAULT_FOOD_ICON, FOOD_CATEGORIES, foodIconHex, foodIconUrl, recipeIconHex, type IngredientEntry } from '..';

const per = { kcal: 100, proteinG: 1, carbG: 1, fatG: 1 };
const foods: IngredientEntry[] = [
  { id: 'oil', name: 'زيت', per100g: per, category: 'fats', icon: '1fad2' },
  { id: 'rice', name: 'رز', per100g: per, category: 'grains', icon: '1f35a' },
  { id: 'misc', name: 'حاجة', per100g: per },
];

describe('food illustrations', () => {
  it('uses the food icon, then its category icon, then a plate', () => {
    expect(foodIconHex({ icon: '1f35a', category: 'grains' })).toBe('1f35a');
    expect(foodIconHex({ category: 'fish' })).toBe(CATEGORY_ICONS.fish);
    expect(foodIconHex({})).toBe(DEFAULT_FOOD_ICON);
    expect(foodIconUrl('1f35a')).toBe('/food/1f35a.svg');
  });

  it('has a category icon for every group', () => {
    for (const c of FOOD_CATEGORIES) expect(CATEGORY_ICONS[c]).toMatch(/^[0-9a-f]+$/);
  });

  it('picks a recipe icon from its biggest non-seasoning ingredient', () => {
    expect(recipeIconHex([{ name: 'زيت', kcal: 500 }, { name: 'رز', kcal: 200 }], foods)).toBe('1f35a');
    expect(recipeIconHex([{ name: 'زيت', kcal: 500 }], foods)).toBe('1fad2');
    expect(recipeIconHex([{ name: 'غير موجود', kcal: 5 }], foods)).toBe(DEFAULT_FOOD_ICON);
  });
});
