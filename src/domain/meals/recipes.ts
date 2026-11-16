import { z } from 'zod';
import { err, ok, recipeMacros, type Per100g, type RecipeError, type Result } from '@/domain/nutrition';

/** One row of the trainer's ingredient table: nutrition per 100 g. */
export const ingredientEntrySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  per100g: z.object({
    kcal: z.number().min(0).max(1000),
    proteinG: z.number().min(0).max(100),
    carbG: z.number().min(0).max(100),
    fatG: z.number().min(0).max(100),
  }),
});
export type IngredientEntry = z.infer<typeof ingredientEntrySchema>;

export interface RecipeItemInput {
  ingredientId: string;
  grams: number;
}

/** The ingredient line stored on a recipe (shape of the Recipe model's ingredients). */
export interface RecipeIngredientRow {
  name: string;
  quantity: number;
  unit: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const GRAM_UNIT = 'g';

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Turns table references into stored rows; each row's values come from recipeMacros, never typed by hand. */
export function buildRecipeRows(items: readonly RecipeItemInput[], table: readonly IngredientEntry[]): Result<RecipeIngredientRow[], RecipeError> {
  const rows: RecipeIngredientRow[] = [];
  for (const item of items) {
    const entry = table.find((e) => e.id === item.ingredientId);
    if (!entry) return err('unknown_ingredient');
    const m = recipeMacros([item], table, 1);
    if (!m.ok) return m;
    rows.push({
      name: entry.name,
      quantity: item.grams,
      unit: GRAM_UNIT,
      kcal: round1(m.value.total.kcal),
      proteinG: round1(m.value.total.proteinG),
      carbsG: round1(m.value.total.carbG),
      fatG: round1(m.value.total.fatG),
    });
  }
  return ok(rows);
}

export interface StoredRecipeLike {
  servings: number;
  ingredients: ReadonlyArray<{ quantity: number; kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }>;
}

export interface RecipeNutrition {
  perServing: Per100g;
  total: Per100g;
  /** True when some ingredient has no values entered (its contribution counts as 0). */
  incomplete: boolean;
}

/**
 * Per-serving macros of a stored recipe, through recipeMacros: every row is expressed as a per-100 g
 * ingredient of its own quantity, so the same summing code is used everywhere.
 */
export function storedRecipeNutrition(recipe: StoredRecipeLike): Result<RecipeNutrition, RecipeError> {
  let incomplete = false;
  const table = recipe.ingredients.map((row, i) => {
    const values = [row.kcal, row.proteinG, row.carbsG, row.fatG];
    if (values.some((v) => v === null)) incomplete = true;
    const k = row.quantity > 0 ? 100 / row.quantity : 0;
    return { id: String(i), per100g: { kcal: (row.kcal ?? 0) * k, proteinG: (row.proteinG ?? 0) * k, carbG: (row.carbsG ?? 0) * k, fatG: (row.fatG ?? 0) * k } };
  });
  const items = recipe.ingredients.map((row, i) => ({ ingredientId: String(i), grams: row.quantity }));
  const m = recipeMacros(items, table, recipe.servings);
  if (!m.ok) return m;
  return ok({ perServing: m.value.perServing, total: m.value.total, incomplete });
}

/** Rows whose ingredient name is in the table, mapped back to table references (for editing). */
export function rowsToItems(rows: readonly { name: string; quantity: number }[], table: readonly IngredientEntry[]): { items: RecipeItemInput[]; unknown: string[] } {
  const items: RecipeItemInput[] = [];
  const unknown: string[] = [];
  for (const row of rows) {
    const entry = table.find((e) => e.name === row.name);
    if (entry) items.push({ ingredientId: entry.id, grams: row.quantity });
    else unknown.push(row.name);
  }
  return { items, unknown };
}
