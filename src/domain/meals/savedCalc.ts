import { z } from 'zod';
import { activityLevelSchema, bmrFormulaSchema, goalSchema } from './settings';
import type { CalcInput, CalcResult, CalcStep } from './calculator';

const num = z.number().finite();

/** A calculator result saved on a client (also what the PDF's "calories and macros" section reads). */
export const savedCalculationSchema = z.object({
  input: z.object({
    sex: z.enum(['male', 'female']),
    ageYears: num,
    heightCm: num,
    weightKg: num,
    bodyFatPercent: num.nullable(),
    formula: bmrFormulaSchema,
    activity: activityLevelSchema,
    goal: goalSchema,
    goalPercent: num,
    proteinPerKg: num,
    fatPerKg: num,
  }),
  bmr: num,
  tdee: num,
  targetKcal: num,
  proteinG: num,
  fatG: num,
  carbG: num,
  proteinKcal: num,
  fatKcal: num,
  carbKcal: num,
  waterMinMl: num,
  waterMaxMl: num,
  bmi: num,
  steps: z.array(z.object({ id: z.string(), expression: z.string(), result: num })),
  savedAt: z.number().int().nonnegative(),
});

export type SavedCalculation = z.infer<typeof savedCalculationSchema>;

/** Rounded snapshot for storage: kcal and grams to whole numbers, BMI to one decimal. */
export function toSavedCalculation(input: CalcInput, r: CalcResult, steps: CalcStep[], savedAt: number): SavedCalculation {
  const whole = Math.round;
  return {
    input: { ...input },
    bmr: whole(r.bmr),
    tdee: whole(r.tdee),
    targetKcal: whole(r.targetKcal),
    proteinG: whole(r.macros.proteinG),
    fatG: whole(r.macros.fatG),
    carbG: whole(r.macros.carbG),
    proteinKcal: whole(r.macros.proteinKcal),
    fatKcal: whole(r.macros.fatKcal),
    carbKcal: whole(r.macros.carbKcal),
    waterMinMl: whole(r.water.minMl),
    waterMaxMl: whole(r.water.maxMl),
    bmi: Math.round(r.bmi * 10) / 10,
    steps: steps.map((s) => ({ ...s, result: Math.round(s.result * 10) / 10 })),
    savedAt,
  };
}

export function parseSavedCalculation(raw: unknown): SavedCalculation | null {
  const r = savedCalculationSchema.safeParse(raw);
  return r.success ? r.data : null;
}
