import { z } from 'zod';
import {
  currencySchema,
  entityMetaShape,
  isoDateSchema,
  longTextSchema,
  moneyMinorSchema,
  requiredNameSchema,
  shortTextSchema,
} from './common';
import { clientIdSchema, imageIdSchema } from './ids';

export const clientGoalSchema = z.enum(['fat_loss', 'muscle_gain', 'strength', 'fitness', 'rehab', 'other']);
export const genderSchema = z.enum(['male', 'female']);

/** A snapshot of body measurements. Lengths in cm, weight in kg (display converts). */
export const measurementsSchema = z.object({
  weightKg: z.number().positive().max(400).optional(),
  heightCm: z.number().positive().max(260).optional(),
  bodyFatPercent: z.number().min(0).max(75).optional(),
  waistCm: z.number().positive().max(300).optional(),
  hipCm: z.number().positive().max(300).optional(),
  chestCm: z.number().positive().max(300).optional(),
  armCm: z.number().positive().max(150).optional(),
  thighCm: z.number().positive().max(200).optional(),
});

export const clientPackageSchema = z.object({
  name: shortTextSchema,
  totalSessions: z.number().int().min(0).max(1000),
  priceMinor: moneyMinorSchema,
  currency: currencySchema,
});

/** Optional training profile: where and how the client trains (drives the exercise fit rules). */
export const trainingPlaceSchema = z.enum(['gym', 'home', 'both']);
export const trainingLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const injuryJointSchema = z.enum(['knee', 'shoulder', 'lower_back', 'wrist', 'elbow', 'neck', 'hip', 'ankle']);
export const trainingEmphasisSchema = z.enum(['fat_loss', 'muscle', 'strength', 'fitness', 'rehab']);
const exerciseRefSchema = z.string().min(1).max(160);

export const trainingProfileSchema = z.object({
  place: trainingPlaceSchema.optional(),
  /** Equipment ids (see src/domain/exercises EQUIPMENT_IDS) the client has at home. */
  homeEquipment: z.array(z.string().min(1).max(40)).max(20).optional(),
  level: trainingLevelSchema.optional(),
  injuredJoints: z.array(injuryJointSchema).max(8).optional(),
  injuryNote: shortTextSchema.optional(),
  emphasis: trainingEmphasisSchema.optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  sessionMinutes: z.number().int().min(15).max(240).optional(),
  avoidIds: z.array(exerciseRefSchema).max(300).optional(),
  favouriteIds: z.array(exerciseRefSchema).max(300).optional(),
});

/** The trainer's note on one exercise for this client only (cue, limit). */
export const clientExerciseNoteSchema = z.object({
  note: shortTextSchema,
  maxKg: z.number().positive().max(500).nullable().optional(),
});

export const clientSchema = z
  .object({
    id: clientIdSchema,
    name: requiredNameSchema,
    phone: z.string().trim().max(30).regex(/^[0-9+\s-]*$/, 'digits only'),
    gender: genderSchema.nullable(),
    birthDate: isoDateSchema.nullable(),
    goal: clientGoalSchema,
    goalNote: shortTextSchema,
    injuries: z.array(shortTextSchema).max(50),
    measurements: measurementsSchema,
    package: clientPackageSchema.nullable(),
    startDate: isoDateSchema.nullable(),
    endDate: isoDateSchema.nullable(),
    remainingSessions: z.number().int().min(0).max(1000),
    notes: longTextSchema,
    photoId: imageIdSchema.nullable(),
    trainingProfile: trainingProfileSchema.optional(),
    /** Per-client exercise notes, keyed by exercise id. */
    exerciseNotes: z.record(exerciseRefSchema, clientExerciseNoteSchema).optional(),
    ...entityMetaShape,
  })
  .refine((c) => !c.startDate || !c.endDate || c.startDate <= c.endDate, {
    message: 'endDate before startDate',
    path: ['endDate'],
  });

export type Client = z.infer<typeof clientSchema>;
export type ClientGoal = z.infer<typeof clientGoalSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
export type TrainingProfile = z.infer<typeof trainingProfileSchema>;
export type ClientExerciseNote = z.infer<typeof clientExerciseNoteSchema>;
