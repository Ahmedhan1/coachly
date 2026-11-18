import { z } from 'zod';
import { entityMetaShape, longTextSchema, requiredNameSchema, shortTextSchema } from './common';
import { imageIdSchema, recipeIdSchema } from './ids';

const nonNegative = z.number().min(0).max(100_000);

export const ingredientSchema = z.object({
  name: requiredNameSchema,
  quantity: z.number().positive().max(100_000),
  unit: z.string().trim().min(1).max(20),
  /** Nutrition for the stated quantity; null when the trainer did not enter it. */
  kcal: nonNegative.nullable(),
  proteinG: nonNegative.nullable(),
  carbsG: nonNegative.nullable(),
  fatG: nonNegative.nullable(),
});

/** Cuisine families used to browse the cookbook (labels live in i18n under nutrition.book.cuisines). */
export const RECIPE_CUISINES = ['egyptian', 'levantine', 'gulf', 'mediterranean', 'asian', 'international'] as const;
export const recipeCuisineSchema = z.enum(RECIPE_CUISINES);
export type RecipeCuisine = z.infer<typeof recipeCuisineSchema>;

/** File stem of a bundled food photo in public/food-img/photos/ (e.g. "koshari" → koshari.webp). */
export const bundledPhotoSchema = z.string().regex(/^[a-z0-9-]{1,60}$/);

export const recipeSchema = z.object({
  id: recipeIdSchema,
  name: requiredNameSchema,
  /** Optional English name (shown when the app is in English). */
  nameEn: shortTextSchema.optional(),
  servings: z.number().int().min(1).max(100),
  ingredients: z.array(ingredientSchema).max(60),
  instructions: longTextSchema,
  instructionsEn: longTextSchema.optional(),
  imageId: imageIdSchema.nullable(),
  /** Bundled photo of a starter recipe (the trainer's own photo, imageId, wins). */
  photo: bundledPhotoSchema.optional(),
  /** Minutes from start to plate (starter recipes). */
  prepMin: z.number().int().min(0).max(1440).optional(),
  cuisine: recipeCuisineSchema.optional(),
  tags: z.array(shortTextSchema).max(20),
  ...entityMetaShape,
});

export type Recipe = z.infer<typeof recipeSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
