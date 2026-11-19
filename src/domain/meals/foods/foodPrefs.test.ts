import { describe, expect, it } from 'vitest';
import {
  EMPTY_PREFS,
  allergensOf,
  blockedRecipes,
  defaultDietSettings,
  dishAlternatives,
  foodBlocked,
  parseFoodPrefs,
  planGramDay,
  recipeBoosts,
  slotsFor,
  type FoodLineSource,
  type GramRecipe,
} from '..';

const DS = defaultDietSettings();
const line = (foodId: string, name: string, category: FoodLineSource['category'], kcal: number, p: number, c: number, f: number, grams: number): FoodLineSource => ({
  foodId,
  name,
  category,
  grams,
  per100g: { kcal, proteinG: p, carbG: c, fatG: f },
});
const egg = (g = 100) => line('egg', 'بيض', 'eggs', 143, 12.6, 0.7, 9.5, g);
const bread = (g = 90) => line('baladi_bread', 'عيش بلدي', 'grains', 266, 9, 55, 1.5, g);
const cheese = (g = 100) => line('areesh_cheese', 'جبنة قريش', 'dairy', 98, 13, 3, 4, g);
const foul = (g = 200) => line('fava_cooked', 'فول مدمس مطبوخ', 'legumes', 110, 7.6, 19.7, 0.4, g);
const tuna = (g = 120) => line('tuna_water', 'تونة في مية مصفاة', 'fish', 116, 26, 0, 1, g);
const salmon = (g = 150) => line('salmon', 'سلمون ني', 'fish', 208, 20, 0, 13, g);
const chicken = (g = 180) => line('chicken_breast', 'صدر فراخ ني', 'poultry', 120, 22.5, 0, 2.6, g);
const rice = (g = 200) => line('rice_cooked', 'رز أبيض مطبوخ', 'grains', 130, 2.7, 28, 0.3, g);
const peanut = (g = 30) => line('peanut_butter', 'زبدة فول سوداني', 'nuts', 588, 25, 20, 50, g);

const BOOK: GramRecipe[] = [
  { id: 'eggs_bread', tags: ['فطار'], lines: [egg(), bread()] },
  { id: 'cheese_bread', tags: ['فطار'], lines: [cheese(), bread()] },
  { id: 'foul', tags: ['فطار'], lines: [foul(), bread(45)] },
  { id: 'tuna_rice', tags: ['غدا'], lines: [tuna(), rice()] },
  { id: 'salmon_rice', tags: ['غدا'], lines: [salmon(), rice()] },
  { id: 'chicken_rice', tags: ['غدا'], lines: [chicken(), rice()] },
  { id: 'pb', tags: ['سناك'], lines: [peanut()] },
];

describe('client food preferences', () => {
  it('parses stored prefs field by field (bad fields → no preference)', () => {
    expect(parseFoodPrefs(null)).toEqual(EMPTY_PREFS);
    expect(parseFoodPrefs({ allergies: ['dairy', 'x'], budget: true })).toEqual({ ...EMPTY_PREFS, budget: true });
    expect(parseFoodPrefs({ dislikes: ['egg'], loves: ['chicken_breast'], allergies: ['fish'] })).toEqual({ dislikes: ['egg'], loves: ['chicken_breast'], allergies: ['fish'], budget: false });
  });

  it('finds allergy groups by id, group and name; peanut butter is nuts not dairy, soy milk is not dairy', () => {
    expect(allergensOf(peanut())).toEqual(['nuts']);
    expect(allergensOf(bread())).toEqual(['gluten']);
    expect(allergensOf(cheese())).toEqual(['dairy']);
    expect(allergensOf({ foodId: 'soy_milk', name: 'لبن صويا', category: 'dairy' })).toEqual([]);
    expect(allergensOf({ name: 'جبنة فيتا من عندي' })).toEqual(['dairy']);
    expect(allergensOf(tuna())).toEqual(['fish']);
    // "أبيض" (white) is not "بيض" (egg); eggplant is not egg.
    expect(allergensOf({ name: 'رز أبيض مطبوخ' })).toEqual([]);
    expect(allergensOf({ name: 'فاصوليا بيضا', nameEn: 'White beans' })).toEqual([]);
    expect(allergensOf({ name: 'بتنجان', nameEn: 'Eggplant' })).toEqual([]);
    expect(allergensOf({ name: 'عجة بالبيض' })).toEqual(['eggs']);
  });

  it('pork is never allowed; dislikes block a food', () => {
    expect(foodBlocked({ name: 'Pork chop', nameEn: 'pork' }, EMPTY_PREFS)).toBe(true);
    expect(foodBlocked(egg(), { ...EMPTY_PREFS, dislikes: ['egg'] })).toBe(true);
    expect(foodBlocked(egg(), EMPTY_PREFS)).toBe(false);
  });

  it('blocks whole recipes with an allergen or a disliked food', () => {
    const b = blockedRecipes(BOOK, { ...EMPTY_PREFS, allergies: ['gluten', 'fish'] });
    expect([...b].sort()).toEqual(['cheese_bread', 'eggs_bread', 'foul', 'salmon_rice', 'tuna_rice']);
  });

  it('boosts loved foods and lowers costly ones in budget mode', () => {
    const m = recipeBoosts(BOOK, { ...EMPTY_PREFS, loves: ['tuna_water'], budget: true });
    expect(m.get('tuna_rice')).toBeGreaterThan(0);
    expect(m.get('salmon_rice')).toBeLessThan(0);
    expect(m.has('chicken_rice')).toBe(false);
  });

  it('the planner and the swap list respect exclusions and favourites', () => {
    const slots = slotsFor('normal', 3, DS).map((s, i) => ({ ...s, kind: (['breakfast', 'lunch', 'snack'] as const)[i] ?? 'lunch' }));
    const target = { kcal: 1800, proteinG: 140, carbG: 180, fatG: 55 };
    const prefs = { ...EMPTY_PREFS, allergies: ['eggs' as const], loves: ['tuna_water'] };
    const exclude = blockedRecipes(BOOK, prefs);
    const boost = recipeBoosts(BOOK, prefs);
    const day = planGramDay(BOOK, target, { goal: 'maintain', slots, dayIndex: 0, recent: new Set(), exclude, boost }, DS);
    const ids = day.meals.flatMap((m) => m.dishes.map((d) => d.recipeId));
    expect(ids).not.toContain('eggs_bread');
    expect(ids).toContain('tuna_rice');
    const alts = dishAlternatives(BOOK, day, 0, 0, { goal: 'maintain', exclude, boost }, 10).map((a) => a.recipeId);
    expect(alts).not.toContain('eggs_bread');
  });
});
