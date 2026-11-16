import { z } from 'zod';
import { entityMetaShape, isoDateSchema, shortTextSchema } from './common';
import { clientIdSchema, exerciseIdSchema, localIdSchema, programIdSchema, sessionIdSchema, workoutLogIdSchema } from './ids';

export const loggedSetSchema = z.object({
  reps: z.number().int().min(0).max(1000),
  weightKg: z.number().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable(),
  done: z.boolean(),
});

export const loggedExerciseSchema = z.object({
  exerciseId: exerciseIdSchema,
  /** The program item this came from, when logged from a program. */
  programItemId: localIdSchema.nullable(),
  sets: z.array(loggedSetSchema).max(30),
  note: shortTextSchema,
});

export const workoutLogSchema = z.object({
  id: workoutLogIdSchema,
  clientId: clientIdSchema,
  date: isoDateSchema,
  programId: programIdSchema.nullable(),
  programDayId: localIdSchema.nullable(),
  sessionId: sessionIdSchema.nullable(),
  exercises: z.array(loggedExerciseSchema).max(60),
  ...entityMetaShape,
});

export type WorkoutLog = z.infer<typeof workoutLogSchema>;
export type LoggedSet = z.infer<typeof loggedSetSchema>;
