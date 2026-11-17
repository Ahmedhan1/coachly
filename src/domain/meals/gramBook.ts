import type { FoodLineSource } from './foodLines';
import type { GramRecipe } from './gramPlanner';
import type { IngredientEntry } from './recipes';

export interface StoredRecipeForPlan {
  id: string;
  servings: number;
  tags: readonly string[];
  ingredients: ReadonlyArray<{ name: string; quantity: number; unit: string; kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }>;
}

/**
 * A stored recipe as the gram planner needs it: one serving's foods with values per 100 g (from the row's own
 * values), enriched by name from the food table (group, English name, counting unit).
 */
export function gramRecipe(recipe: StoredRecipeForPlan, table: readonly IngredientEntry[]): GramRecipe {
  const byName = new Map(table.map((e) => [e.name, e]));
  const servings = Math.max(1, recipe.servings);
  const lines: FoodLineSource[] = [];
  for (const row of recipe.ingredients) {
    if (!(row.quantity > 0)) continue;
    const k = 100 / row.quantity;
    const entry = byName.get(row.name);
    const unitPortion = entry?.unitG !== undefined ? entry.portions?.find((p) => p.grams === entry.unitG) : undefined;
    lines.push({
      name: row.name,
      ...(entry?.nameEn ? { nameEn: entry.nameEn } : {}),
      grams: row.quantity / servings,
      per100g: { kcal: (row.kcal ?? 0) * k, proteinG: (row.proteinG ?? 0) * k, carbG: (row.carbsG ?? 0) * k, fatG: (row.fatG ?? 0) * k },
      ...(entry?.category ? { category: entry.category } : {}),
      ...(entry?.unitG !== undefined ? { unitG: entry.unitG } : {}),
      ...(entry?.unitHalf ? { unitHalf: true } : {}),
      ...(unitPortion ? { unitLabel: unitPortion.label, ...(unitPortion.labelEn ? { unitLabelEn: unitPortion.labelEn } : {}) } : {}),
    });
  }
  return { id: recipe.id, tags: recipe.tags, lines };
}
