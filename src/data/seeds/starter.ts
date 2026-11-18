import { z } from 'zod';
import { buildRecipeRows, ingredientEntrySchema, type IngredientEntry, type RecipeIngredientRow } from '@/domain/meals';
import { bundledPhotoSchema, recipeCuisineSchema, type RecipeCuisine } from '@/domain/models';
import ingredientsJson from './ingredients.ar.json';
import recipesJson from './recipes.ar.json';
import supplementsJson from './supplements.ar.json';

const starterRecipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  servings: z.number().int().min(1),
  tags: z.array(z.string()),
  items: z.array(z.object({ ingredient: z.string(), grams: z.number().positive() })).min(1),
  instructions: z.string(),
  instructionsEn: z.string().optional(),
  prepMin: z.number().int().min(0).optional(),
  cuisine: recipeCuisineSchema.optional(),
  photo: bundledPhotoSchema.optional(),
  /** Data version that introduced the recipe (absent = the first release). Lets updates add only new recipes. */
  since: z.number().int().min(1).optional(),
});

export type StarterRecipeSource = z.infer<typeof starterRecipeSchema>;

export interface StarterRecipe {
  key: string;
  name: string;
  nameEn?: string;
  instructionsEn?: string;
  servings: number;
  tags: string[];
  instructions: string;
  ingredients: RecipeIngredientRow[];
  since: number;
  prepMin?: number;
  cuisine?: RecipeCuisine;
  photo?: string;
}

/** Version of the shipped food table and recipe book. Bumping it makes existing installs merge in what is new. */
export const STARTER_FOOD_VERSION: number = ingredientsJson.version;
export const STARTER_RECIPE_VERSION: number = recipesJson.version;

/** The starter ingredient table (per 100 g, approximate — see README.md next to this file). */
export function starterIngredients(): IngredientEntry[] {
  return z.array(ingredientEntrySchema).parse(ingredientsJson.ingredients);
}

/** Shipped foods whose Arabic name changed (id → former name), so an untouched row on an install can follow. */
export function starterFoodRenames(): Record<string, string> {
  const raw: unknown = (ingredientsJson as { renamed?: unknown }).renamed;
  return z.record(z.string(), z.string()).catch({}).parse(raw ?? {});
}

export function starterRecipeSources(): StarterRecipeSource[] {
  return z.array(starterRecipeSchema).parse(recipesJson.recipes);
}

/** Starter recipes with every ingredient row computed from the table (throws if the data is inconsistent). */
export function starterRecipes(table: readonly IngredientEntry[] = starterIngredients()): StarterRecipe[] {
  return starterRecipeSources().map((r) => {
    const rows = buildRecipeRows(
      r.items.map((i) => ({ ingredientId: i.ingredient, grams: i.grams })),
      table,
    );
    if (!rows.ok) throw new Error(`starter recipe ${r.id}: ${rows.error}`);
    return {
      key: r.id,
      name: r.name,
      ...(r.nameEn ? { nameEn: r.nameEn } : {}),
      servings: r.servings,
      tags: r.tags,
      instructions: r.instructions,
      ...(r.instructionsEn ? { instructionsEn: r.instructionsEn } : {}),
      ingredients: rows.value,
      since: r.since ?? 1,
      ...(r.prepMin !== undefined ? { prepMin: r.prepMin } : {}),
      ...(r.cuisine ? { cuisine: r.cuisine } : {}),
      ...(r.photo ? { photo: r.photo } : {}),
    };
  });
}

/** Starter catalogue: names only. Dose and timing stay empty — the app never suggests doses. */
export function starterSupplements(): { key: string; name: string }[] {
  return z.array(z.object({ id: z.string(), name: z.string().min(1) })).parse(supplementsJson.supplements).map((s) => ({ key: s.id, name: s.name }));
}
