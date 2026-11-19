import type { FoodCategory, IngredientEntry } from './recipes';

/** Twemoji (CC-BY 4.0) code point per food group: the illustration for a food with no icon of its own. */
export const CATEGORY_ICONS: Readonly<Record<FoodCategory, string>> = {
  grains: '1f35e',
  legumes: '1fad8',
  poultry: '1f357',
  meat: '1f356',
  fish: '1f41f',
  eggs: '1f95a',
  dairy: '1f95b',
  veg: '1f96c',
  fruit: '1f34e',
  nuts: '1f95c',
  fats: '1fad2',
  sweets: '1f36b',
  drinks: '1f964',
  fastfood: '1f354',
  dishes: '1f372',
  condiments: '1f9c2',
  protein: '1f4aa',
};

/** Used for a food with neither an icon nor a category (the trainer's own rows). */
export const DEFAULT_FOOD_ICON = '1f37d';

export function foodIconHex(food: Pick<IngredientEntry, 'icon' | 'category'>): string {
  if (food.icon) return food.icon;
  return food.category ? CATEGORY_ICONS[food.category] : DEFAULT_FOOD_ICON;
}

/** Where the bundled illustration lives (served from the app's own files, so it works offline). */
export function foodIconUrl(hex: string): string {
  return `/food/${hex}.svg`;
}

const MINOR_GROUPS: ReadonlySet<FoodCategory> = new Set<FoodCategory>(['condiments', 'fats']);

/**
 * Illustration for a recipe with no photo: the icon of its biggest ingredient (by calories) that is in the food
 * table and is not just seasoning or oil. Rows are matched by name, as recipes store names, not table ids.
 */
export function recipeIconHex(rows: ReadonlyArray<{ name: string; kcal: number | null }>, foods: readonly IngredientEntry[]): string {
  const byName = new Map(foods.map((f) => [f.name, f]));
  let best: { food: IngredientEntry; kcal: number; minor: boolean } | null = null;
  for (const row of rows) {
    const food = byName.get(row.name);
    if (!food) continue;
    const minor = food.category !== undefined && MINOR_GROUPS.has(food.category);
    const kcal = row.kcal ?? 0;
    if (!best || (best.minor && !minor) || (best.minor === minor && kcal > best.kcal)) best = { food, kcal, minor };
  }
  return best ? foodIconHex(best.food) : DEFAULT_FOOD_ICON;
}
