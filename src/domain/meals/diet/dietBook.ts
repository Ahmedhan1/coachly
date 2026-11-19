import type { MacroTotals } from '../foods/totals';
import type { MealKind } from './dietSlots';

/** The planner sees a recipe as its id, its tags and its per-serving macros — nothing else. */
export interface DietRecipe {
  id: string;
  tags: readonly string[];
  perServing: MacroTotals;
}

/** Tag words the trainer's recipe book uses (data, not UI text). */
export const DIET_TAGS = {
  breakfast: 'فطار',
  lunch: 'غدا',
  dinner: 'عشا',
  snack: 'سناك',
  side: 'جانبي',
  salad: 'سلطات',
  vegetarian: 'نباتي',
  cut: 'تنشيف',
  bulk: 'تضخيم',
  highProtein: 'بروتين عالي',
} as const;

const KIND_ORDER: readonly MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Under this many calories an untagged recipe is taken as a snack. */
const SNACK_KCAL_LIMIT = 250;

/** Meal kinds from the recipe's tags; an untagged recipe is guessed from its calories. */
export function recipeKinds(recipe: DietRecipe): MealKind[] {
  const kinds = KIND_ORDER.filter((k) => recipe.tags.includes(DIET_TAGS[k]));
  if (kinds.length > 0) return kinds;
  return recipe.perServing.kcal < SNACK_KCAL_LIMIT ? ['snack'] : ['lunch', 'dinner'];
}

/** Sides and salads top a meal up; they are never the main dish. */
export function isSide(recipe: DietRecipe): boolean {
  return recipe.tags.includes(DIET_TAGS.side) || recipe.tags.includes(DIET_TAGS.salad);
}
