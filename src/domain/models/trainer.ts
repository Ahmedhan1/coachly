import { z } from 'zod';
import { currencySchema, DEFAULT_CURRENCY, hexColorSchema, shortTextSchema, timestampSchema } from './common';
import { imageIdSchema } from './ids';

export const TRAINER_SETTINGS_ID = 'trainer' as const;

export const weightUnitSchema = z.enum(['kg', 'lb']);
export const lengthUnitSchema = z.enum(['cm', 'in']);

/**
 * Formula choices and coefficients are trainer settings with defaults — never constants in code.
 * The nutrition domain reads these; this schema only stores them.
 */
export const formulaDefaultsSchema = z.object({
  bmrFormula: z.enum(['mifflin_st_jeor', 'katch_mcardle']),
  activityFactor: z.number().min(1).max(2.5),
  proteinGPerKg: z.number().min(0).max(5),
  fatPercentOfKcal: z.number().min(0).max(100),
});

export const trainerSettingsSchema = z.object({
  id: z.literal(TRAINER_SETTINGS_ID),
  name: shortTextSchema,
  logoImageId: imageIdSchema.nullable(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  /** Font id from the app's font list; 'system' uses the device font. */
  fontId: z.string().min(1).max(40),
  currency: currencySchema,
  units: z.object({ weight: weightUnitSchema, length: lengthUnitSchema }),
  formulas: formulaDefaultsSchema,
  updatedAt: timestampSchema,
});

export type TrainerSettings = z.infer<typeof trainerSettingsSchema>;
export type FormulaDefaults = z.infer<typeof formulaDefaultsSchema>;

/** Neutral defaults used on first run. The trainer changes all of them in settings. */
export function defaultTrainerSettings(now: number): TrainerSettings {
  return {
    id: TRAINER_SETTINGS_ID,
    name: '',
    logoImageId: null,
    primaryColor: '#2F6F5E',
    secondaryColor: '#3A3A3C',
    fontId: 'system',
    currency: DEFAULT_CURRENCY,
    units: { weight: 'kg', length: 'cm' },
    formulas: { bmrFormula: 'mifflin_st_jeor', activityFactor: 1.55, proteinGPerKg: 2, fatPercentOfKcal: 25 },
    updatedAt: now,
  };
}
