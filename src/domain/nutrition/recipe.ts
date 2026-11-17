import { err, ok, type Result } from './result';

/** Nutrition per 100 g of an ingredient. */
export interface Per100g {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface Ingredient {
  id: string;
  per100g: Per100g;
}

export interface RecipeItem {
  ingredientId: string;
  grams: number;
}

export interface RecipeMacros {
  total: Per100g;
  perServing: Per100g;
  totalGrams: number;
}

export type RecipeError = 'unknown_ingredient' | 'invalid_grams' | 'invalid_servings' | 'invalid_ingredient_values';

const ZERO: Per100g = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

function scale(v: Per100g, k: number): Per100g {
  return { kcal: v.kcal * k, proteinG: v.proteinG * k, carbG: v.carbG * k, fatG: v.fatG * k };
}

function add(a: Per100g, b: Per100g): Per100g {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG };
}

function validValues(v: Per100g): boolean {
  return [v.kcal, v.proteinG, v.carbG, v.fatG].every((x) => Number.isFinite(x) && x >= 0);
}

/** Sum of (per-100 g value × grams / 100) over the items, and the same divided by servings. */
export function recipeMacros(
  items: readonly RecipeItem[],
  ingredients: readonly Ingredient[],
  servings: number,
): Result<RecipeMacros, RecipeError> {
  if (!Number.isInteger(servings) || servings < 1) return err('invalid_servings');
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  let total = ZERO;
  let totalGrams = 0;
  for (const item of items) {
    const ing = byId.get(item.ingredientId);
    if (!ing) return err('unknown_ingredient');
    if (!Number.isFinite(item.grams) || item.grams < 0) return err('invalid_grams');
    if (!validValues(ing.per100g)) return err('invalid_ingredient_values');
    total = add(total, scale(ing.per100g, item.grams / 100));
    totalGrams += item.grams;
  }
  return ok({ total, perServing: scale(total, 1 / servings), totalGrams });
}
