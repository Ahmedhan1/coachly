import { z } from 'zod';
import { entityMetaShape, longTextSchema, requiredNameSchema, shortTextSchema, timeOfDaySchema } from './common';
import { clientIdSchema, localIdSchema, mealPlanIdSchema, recipeIdSchema } from './ids';

const gramValue = z.number().min(0).max(100_000);

/**
 * One food of a planned dish in exact grams (from the diet planner). The shown values are integers and the meal's
 * totals are their sum. Optional: older items have servings only.
 */
export const mealItemLineSchema = z.object({
  name: requiredNameSchema,
  nameEn: shortTextSchema.optional(),
  grams: gramValue,
  /** Count for eggs and loaves (2 eggs, 1.5 loaves). */
  units: z.number().positive().max(100).optional(),
  unitLabel: shortTextSchema.optional(),
  unitLabelEn: shortTextSchema.optional(),
  kcal: gramValue,
  proteinG: gramValue,
  carbG: gramValue,
  fatG: gramValue,
});

/** A meal item is either a recipe from the trainer's book or free text. */
export const mealItemSchema = z
  .object({
    recipeId: recipeIdSchema.nullable(),
    text: shortTextSchema,
    /** For older readers (PDF, client page): the item's calories ÷ the recipe's per-serving calories. */
    servings: z.number().positive().max(20),
    /** Exact grams per food when the item came from the gram planner; totals then come from these. */
    lines: z.array(mealItemLineSchema).max(30).optional(),
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
export type MealItemLine = z.infer<typeof mealItemLineSchema>;
