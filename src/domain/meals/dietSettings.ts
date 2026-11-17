import { z } from 'zod';

const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Every coefficient the diet planner uses, kept apart from the calculator's settings so the trainer can tune
 * them (stored as one document, see src/data/nutritionStore.ts). Percentages are plain numbers (5 means 5 %).
 */
export const dietSettingsShape = {
  /** High-protein style: protein per kg of body weight (never below what the goal already asked for). */
  highProteinPerKg: z.number().min(1).max(4),
  /** Low-carb style: carbs as a share of the day's calories. */
  lowCarbPercent: z.number().min(2).max(45),
  /** A generated day counts as "on target" within ± this percent of the calories. */
  kcalTolerancePercent: z.number().min(1).max(20),
  /** Same for protein (never below) and the carb/fat information flags. */
  macroTolerancePercent: z.number().min(1).max(40),
  minServings: z.number().min(0.25).max(2),
  maxServings: z.number().min(1).max(8),
  servingStep: z.number().min(0.05).max(1),
  /** Cutting: extra protein per kg on top of the calculator's value (kept inside the trainer's protein range). */
  cutProteinBoostPerKg: z.number().min(0).max(1),
  /** Safety floors: below these the app warns and, when asked, lifts the target. */
  minKcalFemale: z.number().min(800).max(3000),
  minKcalMale: z.number().min(1000).max(3500),
  minProteinPerKg: z.number().min(0.5).max(3),
  minFatPerKg: z.number().min(0.2).max(2),
  /** Warn when a cut is deeper / a bulk surplus is bigger than this share of the daily burn. */
  maxDeficitPercent: z.number().min(10).max(50),
  maxSurplusPercent: z.number().min(5).max(40),
  /** Intermittent fasting: when the eating window opens (it lasts 8 hours). */
  ifWindowStart: timeText,
  iftarTime: timeText,
  suhoorTime: timeText,
};

export const dietSettingsSchema = z.object(dietSettingsShape);
export type DietSettings = z.infer<typeof dietSettingsSchema>;

export function defaultDietSettings(): DietSettings {
  return {
    highProteinPerKg: 2.3,
    lowCarbPercent: 20,
    kcalTolerancePercent: 5,
    macroTolerancePercent: 10,
    minServings: 0.5,
    maxServings: 3,
    servingStep: 0.25,
    cutProteinBoostPerKg: 0.2,
    minKcalFemale: 1200,
    minKcalMale: 1500,
    minProteinPerKg: 1.2,
    minFatPerKg: 0.5,
    maxDeficitPercent: 30,
    maxSurplusPercent: 20,
    ifWindowStart: '12:00',
    iftarTime: '18:00',
    suhoorTime: '03:30',
  };
}

/** Reads stored settings field by field: a bad or missing field falls back to its default (never throws). */
export function parseDietSettings(raw: unknown): DietSettings {
  const defaults = defaultDietSettings();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const source = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(dietSettingsShape) as (keyof DietSettings)[]) {
    const field = dietSettingsShape[key].safeParse(source[key]);
    if (field.success) merged[key] = field.data;
  }
  const parsed = dietSettingsSchema.safeParse(merged);
  if (!parsed.success || parsed.data.minServings > parsed.data.maxServings) return defaults;
  return parsed.data;
}
