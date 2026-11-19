import { z } from 'zod';
import {
  DEFAULT_ACTIVITY_FACTORS,
  DEFAULT_BODY_INPUT_LIMITS,
  DEFAULT_FAT_G_PER_KG,
  DEFAULT_GOAL_RANGES,
  DEFAULT_KATCH_MCARDLE,
  DEFAULT_MACRO_SETTINGS,
  DEFAULT_MIFFLIN,
  DEFAULT_NAVY,
  DEFAULT_PROTEIN_G_PER_KG,
  DEFAULT_WATER_ML_PER_KG,
} from '@/domain/nutrition';

const num = z.number().finite();
const range = z.object({ min: num, max: num }).refine((r) => r.min <= r.max, 'min > max');
const navySex = z.object({ a: num, b: num, c: num });

export const activityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'high', 'veryHigh']);
export const bmrFormulaSchema = z.enum(['mifflin-st-jeor', 'katch-mcardle']);
export const goalSchema = z.enum(['cut', 'maintain', 'bulk']);

/**
 * Every coefficient the calculator uses. Defaults come from src/domain/nutrition; the trainer edits all of
 * them in settings. Stored as one document (see src/data/nutritionStore.ts).
 */
export const nutritionSettingsSchema = z.object({
  defaultFormula: bmrFormulaSchema,
  /** Use Katch-McArdle automatically when the client's body fat is known. */
  preferKatchWhenBodyFat: z.boolean(),
  mifflin: z.object({ perKg: num, perCm: num, perYear: num, maleConstant: num, femaleConstant: num }),
  katchMcArdle: z.object({ base: num, perKgLbm: num }),
  activityFactors: z.object({
    sedentary: num.positive(),
    light: num.positive(),
    moderate: num.positive(),
    high: num.positive(),
    veryHigh: num.positive(),
  }),
  defaultActivity: activityLevelSchema,
  goalRanges: z.object({ cut: range, bulk: range }),
  defaultGoalPercent: z.object({ cut: num, bulk: num }),
  proteinPerKgRange: range,
  fatPerKgRange: range,
  defaultProteinPerKg: num,
  defaultFatPerKg: num,
  kcalPerGram: z.object({ protein: num.positive(), carb: num.positive(), fat: num.positive() }),
  waterMlPerKg: range,
  navy: z.object({ numerator: num, offset: num, male: navySex, female: navySex }),
  /** Meal-plan day is "on target" within ± this percent of the calculator's calories. */
  targetTolerancePercent: num.min(0).max(50),
  limits: z.object({
    minWeightKg: num,
    maxWeightKg: num,
    minHeightCm: num,
    maxHeightCm: num,
    minAgeYears: num,
    maxAgeYears: num,
  }),
});

export type NutritionSettings = z.infer<typeof nutritionSettingsSchema>;

export function defaultNutritionSettings(): NutritionSettings {
  return {
    defaultFormula: 'mifflin-st-jeor',
    preferKatchWhenBodyFat: true,
    mifflin: { ...DEFAULT_MIFFLIN },
    katchMcArdle: { ...DEFAULT_KATCH_MCARDLE },
    activityFactors: { ...DEFAULT_ACTIVITY_FACTORS },
    defaultActivity: 'moderate',
    goalRanges: { cut: { ...DEFAULT_GOAL_RANGES.cut }, bulk: { ...DEFAULT_GOAL_RANGES.bulk } },
    defaultGoalPercent: { cut: 20, bulk: 10 },
    proteinPerKgRange: { ...DEFAULT_MACRO_SETTINGS.proteinPerKgRange },
    fatPerKgRange: { ...DEFAULT_MACRO_SETTINGS.fatPerKgRange },
    defaultProteinPerKg: DEFAULT_PROTEIN_G_PER_KG,
    defaultFatPerKg: DEFAULT_FAT_G_PER_KG,
    kcalPerGram: { ...DEFAULT_MACRO_SETTINGS.kcalPerGram },
    waterMlPerKg: { ...DEFAULT_WATER_ML_PER_KG },
    navy: { ...DEFAULT_NAVY, male: { ...DEFAULT_NAVY.male }, female: { ...DEFAULT_NAVY.female } },
    targetTolerancePercent: 5,
    limits: { ...DEFAULT_BODY_INPUT_LIMITS },
  };
}

export type SettingsProblem = 'default_goal_outside_range' | 'default_macro_outside_range';

/** Cross-field checks the schema cannot express. Empty when the settings are consistent. */
export function settingsProblems(s: NutritionSettings): SettingsProblem[] {
  const out: SettingsProblem[] = [];
  const inRange = (x: number, r: { min: number; max: number }) => x >= r.min && x <= r.max;
  if (!inRange(s.defaultGoalPercent.cut, s.goalRanges.cut) || !inRange(s.defaultGoalPercent.bulk, s.goalRanges.bulk)) {
    out.push('default_goal_outside_range');
  }
  if (!inRange(s.defaultProteinPerKg, s.proteinPerKgRange) || !inRange(s.defaultFatPerKg, s.fatPerKgRange)) {
    out.push('default_macro_outside_range');
  }
  return out;
}

/** Reads stored settings; anything missing or invalid falls back to the defaults (never throws). */
export function parseNutritionSettings(raw: unknown): NutritionSettings {
  const defaults = defaultNutritionSettings();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const parsed = nutritionSettingsSchema.safeParse({ ...defaults, ...(raw as Record<string, unknown>) });
  return parsed.success ? parsed.data : defaults;
}
