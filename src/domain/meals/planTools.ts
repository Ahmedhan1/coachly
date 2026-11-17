import { dayTotals, type PerServingLookup, type PlanMeal } from './totals';

/** Servings are rounded to quarters so portions stay practical ("1¼ حصة"). */
const roundQuarter = (n: number) => Math.round(n * 4) / 4;

export interface ScaleResult<M> {
  meals: M[];
  /** Factor applied to recipe items (1 = unchanged). */
  factor: number;
  /** Calories counted before and after (free-text items are not counted and never changed). */
  beforeKcal: number;
  afterKcal: number;
}

/**
 * Scales every recipe item's servings by one factor so the day's counted calories land on `targetKcal`.
 * Free-text items stay as they are. The factor is clamped to [minFactor, maxFactor] (portions you can eat).
 */
export function scaleDayToTarget<M extends PlanMeal>(
  meals: readonly M[],
  lookup: PerServingLookup,
  targetKcal: number,
  opts: { minFactor?: number; maxFactor?: number } = {},
): ScaleResult<M> | null {
  const before = dayTotals(meals, lookup).totals.kcal;
  if (!(before > 0) || !(targetKcal > 0)) return null;
  const factor = Math.min(opts.maxFactor ?? 3, Math.max(opts.minFactor ?? 0.25, targetKcal / before));
  const scaled = meals.map((m) => ({
    ...m,
    items: m.items.map((it) => (it.recipeId && lookup.has(it.recipeId) ? { ...it, servings: Math.max(0.25, roundQuarter(it.servings * factor)) } : it)),
  }));
  return { meals: scaled, factor, beforeKcal: before, afterKcal: dayTotals(scaled, lookup).totals.kcal };
}

export interface ShoppingRecipe {
  id: string;
  servings: number;
  ingredients: ReadonlyArray<{ name: string; quantity: number; unit: string }>;
}

export interface ShoppingLine {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Shopping list for one or more plan days, repeated `days` times (e.g. a week): recipe ingredients are added up
 * by name and unit (quantity × servings ÷ recipe servings); free-text items are listed once each.
 */
export function shoppingList(
  plans: ReadonlyArray<{ meals: readonly PlanMeal[] }>,
  recipes: ReadonlyMap<string, ShoppingRecipe>,
  repeat = 1,
): { lines: ShoppingLine[]; extras: string[] } {
  const totals = new Map<string, ShoppingLine>();
  const extras: string[] = [];
  for (const plan of plans) {
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined;
        if (!recipe) {
          const text = item.text.trim();
          if (text && !extras.includes(text)) extras.push(text);
          continue;
        }
        const k = (item.servings / Math.max(1, recipe.servings)) * repeat;
        for (const ing of recipe.ingredients) {
          const key = `${ing.name}|${ing.unit}`;
          const prev = totals.get(key);
          totals.set(key, { name: ing.name, unit: ing.unit, quantity: (prev?.quantity ?? 0) + ing.quantity * k });
        }
      }
    }
  }
  const lines = [...totals.values()]
    .map((l) => ({ ...l, quantity: l.quantity >= 100 ? Math.round(l.quantity / 10) * 10 : Math.round(l.quantity) }))
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return { lines, extras };
}

/** Plain text for WhatsApp / copy: one line per item. */
export function shoppingText(title: string, list: { lines: ShoppingLine[]; extras: string[] }): string {
  return [title, ...list.lines.map((l) => `• ${l.name}: ${l.quantity} ${l.unit}`), ...list.extras.map((e) => `• ${e}`)].join('\n');
}
