import { z } from 'zod';
import { entityMetaShape, longTextSchema, requiredNameSchema, shortTextSchema } from './common';
import { clientIdSchema, exerciseIdSchema, localIdSchema, programIdSchema } from './ids';

/** Reps are text so trainers can write "8-12", "AMRAP", "30s". */
export const programItemSchema = z.object({
  id: localIdSchema,
  exerciseId: exerciseIdSchema,
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(20),
  restSec: z.number().int().min(0).max(900),
  /** e.g. "3-1-1-0"; empty when unused. */
  tempo: z.string().trim().max(12).regex(/^(\d|X)?(-(\d|X)){0,3}$|^$/i, 'tempo like 3-1-1-0'),
  rpe: z.number().min(1).max(10).multipleOf(0.5).nullable(),
  /** Items sharing the same group label form a superset; null when standalone. */
  supersetGroup: z.string().trim().min(1).max(4).nullable(),
  notes: shortTextSchema,
});

export const programDaySchema = z.object({
  id: localIdSchema,
  name: shortTextSchema,
  items: z.array(programItemSchema).max(60),
});

export const programSchema = z.object({
  id: programIdSchema,
  name: requiredNameSchema,
  /** null for a template not assigned to anyone. */
  clientId: clientIdSchema.nullable(),
  isTemplate: z.boolean(),
  days: z.array(programDaySchema).max(14),
  notes: longTextSchema,
  ...entityMetaShape,
});

export type Program = z.infer<typeof programSchema>;
export type ProgramDay = z.infer<typeof programDaySchema>;
export type ProgramItem = z.infer<typeof programItemSchema>;
