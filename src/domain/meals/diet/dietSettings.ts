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
  /** Macro control: protein floor while cutting, protein ceiling, and the fat share that earns a warning. */
  cutMinProteinPerKg: z.number().min(0.8).max(3),
  maxProteinPerKg: z.number().min(2).max(5),
  maxFatPercent: z.number().min(25).max(80),
  /** Weekly weight change the goal aims for, in % of body weight (cut: loss, bulk: gain, maintain: ± band). */
  cutRateMinPercent: z.number().min(0.1).max(1.5),
  cutRateMaxPercent: z.number().min(0.2).max(2),
  bulkRateMinPercent: z.number().min(0).max(1),
  bulkRateMaxPercent: z.number().min(0.1).max(1.5),
  maintainBandPercent: z.number().min(0.05).max(1),
  /** Energy in one kg of body weight change, used to size a suggested calorie change. */
  kcalPerKgChange: z.number().min(3000).max(9000),
  /** Carb cycling: extra calories (all carbs) on a training day compared with a rest day. */
  trainingDayExtraKcal: z.number().min(0).max(1000),
  /** Goal planner: kcal per kg of lean gain, fastest loss (%/week), gain caps by training age (%/month). */
  kcalPerKgGain: z.number().min(2000).max(9000),
  maxLossPercentPerWeek: z.number().min(0.2).max(2),
  gainCapBeginner: z.number().min(0.1).max(4),
  gainCapIntermediate: z.number().min(0.1).max(4),
  gainCapAdvanced: z.number().min(0.1).max(4),
  /** Share of lost weight that is fat and of gained weight that is lean (0–1). */
  lossFatShare: z.number().min(0.3).max(1),
  gainLeanShare: z.number().min(0.1).max(1),
  recompDeficitPercent: z.number().min(0).max(20),
  /** Personal protein (g/kg): cut on fat-free mass (range), cut on body weight, bulk range, recomp, maintain. */
  protCutFfmMin: z.number().min(1).max(4),
  protCutFfmMax: z.number().min(1).max(4),
  protCutBw: z.number().min(1).max(4),
  protBulkMin: z.number().min(1).max(4),
  protBulkMax: z.number().min(1).max(4),
  protRecomp: z.number().min(1).max(4),
  protMaintain: z.number().min(0.8).max(4),
  protAge50Bonus: z.number().min(0).max(1),
  /** From this BMI protein is counted on an adjusted weight. */
  obeseBmi: z.number().min(25).max(45),
  /** Fat floor of the personal plan: g/kg and % of calories. */
  fatFloorPerKg: z.number().min(0.3).max(2),
  fatMinPercent: z.number().min(10).max(40),
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
    cutMinProteinPerKg: 1.6,
    maxProteinPerKg: 3.3,
    maxFatPercent: 45,
    cutRateMinPercent: 0.4,
    cutRateMaxPercent: 1,
    bulkRateMinPercent: 0.1,
    bulkRateMaxPercent: 0.5,
    maintainBandPercent: 0.25,
    kcalPerKgChange: 7700,
    trainingDayExtraKcal: 300,
    kcalPerKgGain: 5500,
    maxLossPercentPerWeek: 1,
    gainCapBeginner: 1.5,
    gainCapIntermediate: 1,
    gainCapAdvanced: 0.5,
    lossFatShare: 0.75,
    gainLeanShare: 0.5,
    recompDeficitPercent: 0,
    protCutFfmMin: 2.3,
    protCutFfmMax: 3.1,
    protCutBw: 2.2,
    protBulkMin: 1.6,
    protBulkMax: 2.2,
    protRecomp: 2.2,
    protMaintain: 1.8,
    protAge50Bonus: 0.2,
    obeseBmi: 30,
    fatFloorPerKg: 0.8,
    fatMinPercent: 20,
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
  if (parsed.data.cutRateMinPercent > parsed.data.cutRateMaxPercent || parsed.data.bulkRateMinPercent > parsed.data.bulkRateMaxPercent) return defaults;
  if (parsed.data.protCutFfmMin > parsed.data.protCutFfmMax || parsed.data.protBulkMin > parsed.data.protBulkMax) return defaults;
  return parsed.data;
}
