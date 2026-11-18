import type { MacroTotals } from '@/domain/meals';
import type { Recipe, RecipeCuisine } from '@/domain/models';

/** Tags the starter cookbook uses (Arabic, as stored on the recipes). */
export const BROWSE_TAGS = {
  breakfast: 'فطار',
  lunch: 'غدا',
  dinner: 'عشا',
  snack: 'سناك',
  cut: 'تنشيف',
  bulk: 'تضخيم',
  vegetarian: 'نباتي',
  vegan: 'نباتي صرف',
  quick: 'سريع',
  highProtein: 'بروتين عالي',
  ramadan: 'رمضان',
  budget: 'اقتصادي',
} as const;

export type BrowseSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type BrowseFlag = 'cut' | 'bulk' | 'vegetarian' | 'vegan' | 'quick' | 'highProtein' | 'ramadan' | 'budget';
export const BROWSE_SLOTS: readonly BrowseSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const BROWSE_FLAGS: readonly BrowseFlag[] = ['highProtein', 'quick', 'cut', 'bulk', 'vegetarian', 'vegan', 'ramadan', 'budget'];

export interface RecipeFilter {
  slot: BrowseSlot | null;
  cuisine: RecipeCuisine | null;
  flags: readonly BrowseFlag[];
}

export const NO_FILTER: RecipeFilter = { slot: null, cuisine: null, flags: [] };

export const isFiltered = (f: RecipeFilter) => f.slot !== null || f.cuisine !== null || f.flags.length > 0;

/** Quick = 15 minutes or less (or tagged quick when the trainer gave no time). */
export const QUICK_MINUTES = 15;
/** High protein = tagged, or at least 30 % of the calories from protein. */
export const HIGH_PROTEIN_SHARE = 0.3;

function hasFlag(recipe: Pick<Recipe, 'tags' | 'prepMin'>, perServing: MacroTotals, flag: BrowseFlag): boolean {
  const tagged = recipe.tags.includes(BROWSE_TAGS[flag]);
  switch (flag) {
    case 'quick':
      return recipe.prepMin !== undefined ? recipe.prepMin <= QUICK_MINUTES : tagged;
    case 'highProtein':
      return tagged || (perServing.kcal > 0 && (perServing.proteinG * 4) / perServing.kcal >= HIGH_PROTEIN_SHARE);
    case 'vegetarian':
      return tagged || recipe.tags.includes(BROWSE_TAGS.vegan);
    default:
      return tagged;
  }
}

/** Every chosen filter must match (slot AND cuisine AND each flag). */
export function matchesFilter(recipe: Pick<Recipe, 'tags' | 'prepMin' | 'cuisine'>, perServing: MacroTotals, f: RecipeFilter): boolean {
  if (f.slot && !recipe.tags.includes(BROWSE_TAGS[f.slot])) return false;
  if (f.cuisine && recipe.cuisine !== f.cuisine) return false;
  return f.flags.every((flag) => hasFlag(recipe, perServing, flag));
}

export function toggleFlag(f: RecipeFilter, flag: BrowseFlag): RecipeFilter {
  return { ...f, flags: f.flags.includes(flag) ? f.flags.filter((x) => x !== flag) : [...f.flags, flag] };
}
