import { checkMacros } from './dietPlanner';
import type { DietSettings } from './dietSettings';
import { dishAlternatives, swapDish, type GramDay, type GramMeal, type GramPlanOptions, type GramRecipe } from './gramPlanner';

export interface MealOption {
  /** The main dish of this option. */
  recipeId: string;
  meal: GramMeal;
}

/**
 * Up to `n` ways to eat one meal of the day: the planned one first, then other main dishes for the same slot,
 * each re-balanced in grams to the meal's own target. Used for "the trainer picks" and "the client picks".
 */
export function mealOptions(book: readonly GramRecipe[], day: GramDay, mealIndex: number, opts: GramPlanOptions, ds: DietSettings, n = 3): MealOption[] {
  const meal = day.meals[mealIndex];
  const main = meal?.dishes[0];
  if (!meal || !main) return [];
  const out: MealOption[] = [{ recipeId: main.recipeId, meal }];
  for (const alt of dishAlternatives(book, day, mealIndex, 0, opts, Math.max(0, n - 1))) {
    const next = swapDish(day, book, mealIndex, 0, alt.recipeId, ds).meals[mealIndex];
    if (next) out.push({ recipeId: alt.recipeId, meal: next });
  }
  return out.slice(0, n);
}

/** Puts a chosen option in place of the meal (the rest of the day is untouched). */
export function withMealOption(day: GramDay, mealIndex: number, option: MealOption, ds: DietSettings): GramDay {
  const meals = day.meals.map((m, i) => (i === mealIndex ? option.meal : m));
  const totals = meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.totals.kcal, proteinG: a.proteinG + m.totals.proteinG, carbG: a.carbG + m.totals.carbG, fatG: a.fatG + m.totals.fatG }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  );
  return { ...day, meals, totals, check: checkMacros(totals, day.target, ds) };
}
