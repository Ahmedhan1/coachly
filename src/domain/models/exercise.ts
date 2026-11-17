import { z } from 'zod';
import { entityMetaShape, longTextSchema, requiredNameSchema, shortTextSchema } from './common';
import { exerciseIdSchema, imageIdSchema } from './ids';

export const exerciseLevelSchema = z.enum(['beginner', 'intermediate', 'expert']);

/**
 * Either a reference to a built-in library exercise (with the trainer's optional name override)
 * or a custom exercise the trainer created with their own photos.
 */
export const exerciseSchema = z
  .object({
    id: exerciseIdSchema,
    source: z.enum(['builtin', 'custom']),
    /** Id in the bundled exercise library; required for builtin, null for custom. */
    builtinRef: z.string().min(1).max(120).nullable(),
    name: requiredNameSchema,
    primaryMuscles: z.array(shortTextSchema).max(20),
    secondaryMuscles: z.array(shortTextSchema).max(20),
    equipment: shortTextSchema,
    level: exerciseLevelSchema.nullable(),
    instructions: longTextSchema,
    imageIds: z.array(imageIdSchema).max(10),
    favorite: z.boolean(),
    ...entityMetaShape,
  })
  .refine((e) => (e.source === 'builtin') === (e.builtinRef !== null), {
    message: 'builtin exercises need builtinRef; custom ones must not have it',
    path: ['builtinRef'],
  });

export type Exercise = z.infer<typeof exerciseSchema>;
