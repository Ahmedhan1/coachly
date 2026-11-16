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
    ...entityMetaShape,
  })
  .refine((c) => !c.startDate || !c.endDate || c.startDate <= c.endDate, {
    message: 'endDate before startDate',
    path: ['endDate'],
  });

export type Client = z.infer<typeof clientSchema>;
export type ClientGoal = z.infer<typeof clientGoalSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
