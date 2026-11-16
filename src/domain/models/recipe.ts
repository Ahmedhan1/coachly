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

export const recipeSchema = z.object({
  id: recipeIdSchema,
  name: requiredNameSchema,
  servings: z.number().int().min(1).max(100),
  ingredients: z.array(ingredientSchema).max(60),
  instructions: longTextSchema,
  imageId: imageIdSchema.nullable(),
  tags: z.array(shortTextSchema).max(20),
  ...entityMetaShape,
});

export type Recipe = z.infer<typeof recipeSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
