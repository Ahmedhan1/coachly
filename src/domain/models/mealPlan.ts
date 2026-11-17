import { z } from 'zod';
import { entityMetaShape, longTextSchema, requiredNameSchema, shortTextSchema, timeOfDaySchema } from './common';
import { clientIdSchema, localIdSchema, mealPlanIdSchema, recipeIdSchema } from './ids';

/** A meal item is either a recipe from the trainer's book or free text. */
export const mealItemSchema = z
  .object({
    recipeId: recipeIdSchema.nullable(),
    text: shortTextSchema,
    servings: z.number().positive().max(20),
  })
  .refine((i) => i.recipeId !== null || i.text.length > 0, { message: 'recipe or text required' });

export const mealSchema = z.object({
  id: localIdSchema,
  name: shortTextSchema,
  time: timeOfDaySchema.nullable(),
  items: z.array(mealItemSchema).max(30),
});

export const mealPlanSchema = z.object({
  id: mealPlanIdSchema,
  clientId: clientIdSchema.nullable(),
  name: requiredNameSchema,
  targetKcal: z.number().int().min(0).max(20_000).nullable(),
  meals: z.array(mealSchema).max(12),
  notes: longTextSchema,
  ...entityMetaShape,
});

export type MealPlan = z.infer<typeof mealPlanSchema>;
export type Meal = z.infer<typeof mealSchema>;
