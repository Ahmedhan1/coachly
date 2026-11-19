import { describe, expect, it } from 'vitest';
import { scaleDayToTarget, shoppingList, shoppingText } from './planTools';

const lookup = new Map([
  ['foul', { kcal: 300, proteinG: 15, carbG: 40, fatG: 8 }],
  ['rice', { kcal: 200, proteinG: 4, carbG: 44, fatG: 1 }],
]);
const meals = [
  { id: 'm1', name: 'فطار', time: null, items: [{ recipeId: 'foul', text: '', servings: 1 }, { recipeId: null, text: 'شاي', servings: 1 }] },
  { id: 'm2', name: 'غدا', time: null, items: [{ recipeId: 'rice', text: '', servings: 2 }] },
];

describe('scaleDayToTarget', () => {
  it('scales recipe servings to the target, in quarters, leaving free text alone', () => {
    const r = scaleDayToTarget(meals, lookup, 1050)!;
    expect(r.beforeKcal).toBe(700);
    expect(r.factor).toBeCloseTo(1.5);
    expect(r.meals[0]?.items[0]?.servings).toBe(1.5);
    expect(r.meals[0]?.items[1]).toEqual({ recipeId: null, text: 'شاي', servings: 1 });
    expect(r.meals[1]?.items[0]?.servings).toBe(3);
    expect(r.afterKcal).toBe(1050);
  });
  it('clamps the factor and refuses empty days', () => {
    expect(scaleDayToTarget(meals, lookup, 100000)!.factor).toBe(3);
    expect(scaleDayToTarget([], lookup, 2000)).toBeNull();
  });
});

describe('shoppingList', () => {
  const recipes = new Map([
    ['foul', { id: 'foul', servings: 1, ingredients: [{ name: 'فول', quantity: 200, unit: 'جم' }, { name: 'زيت زيتون', quantity: 10, unit: 'جم' }] }],
    ['rice', { id: 'rice', servings: 2, ingredients: [{ name: 'رز', quantity: 300, unit: 'جم' }, { name: 'زيت زيتون', quantity: 5, unit: 'جم' }] }],
  ]);
  it('adds ingredients across meals and days, and lists free text once', () => {
    const list = shoppingList([{ meals }], recipes, 7);
    expect(list.lines).toEqual([
    { name: 'رز', unit: 'جم', quantity: 2100 },
    { name: 'زيت زيتون', unit: 'جم', quantity: 110 },
    { name: 'فول', unit: 'جم', quantity: 1400 },
  ].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    expect(list.extras).toEqual(['شاي']);
    expect(shoppingText('مشتريات', list)).toContain('• شاي');
  });
});

describe('items with exact gram lines', () => {
  const line = (name: string, grams: number, kcal: number, p: number, c: number, f: number) => ({ name, grams, kcal, proteinG: p, carbG: c, fatG: f });
  const gramMeals = [
    {
      id: 'g1',
      name: 'غدا',
      time: null,
      items: [{ recipeId: 'rice', text: '', servings: 2.1, lines: [line('صدر فراخ ني (من غير جلد)', 200, 240, 45, 0, 5), line('رز أبيض مطبوخ', 150, 195, 4, 42, 0)] }],
    },
  ];

  it('totals come from the lines, not the servings', () => {
    const r = scaleDayToTarget(gramMeals, lookup, 435)!;
    expect(r.beforeKcal).toBe(435);
  });

  it('scaling moves the grams on a 5 g grid and the values with them', () => {
    const r = scaleDayToTarget(gramMeals, lookup, 870)!;
    const lines = r.meals[0]!.items[0]!.lines!;
    expect(lines.map((l) => l.grams)).toEqual([400, 300]);
    expect(lines.map((l) => l.kcal)).toEqual([480, 390]);
    expect(r.afterKcal).toBe(870);
  });

  it('shopping adds up the grams by food', () => {
    const list = shoppingList([{ meals: gramMeals }, { meals: gramMeals }], new Map(), 1);
    expect(list.lines).toEqual([
      { name: 'رز أبيض مطبوخ', unit: 'g', quantity: 300 },
      { name: 'صدر فراخ ني (من غير جلد)', unit: 'g', quantity: 400 },
    ]);
  });
});
