import { z } from 'zod';
import type { TrainingExperience } from '@/domain/nutrition';
import { EMPTY_PREFS, parseFoodPrefs, type FoodPrefs } from '../foods/foodPrefs';
import type { MacroSpec } from './macroControl';
import { SPLIT_PRESETS, type SplitPreset } from './mealSplit';

/**
 * A client's calorie-control choices, kept between visits (stored per client in the nutrition key/value store):
 * food preferences, the meal split, the workout time, carb cycling and the trainer's own macro split.
 */
export interface DietProfile {
  prefs: FoodPrefs;
  split: SplitPreset | 'custom';
  /** Shares per meal when `split` is custom (must match the number of meals to be used). */
  shares: number[] | null;
  /** "HH:MM" or null (no fixed training time). */
  workoutTime: string | null;
  /** Carb cycling; `extraKcal` null = the diet settings' training-day extra. */
  cycle: { enabled: boolean; trainingDays: number[]; refeedDay: number | null; extraKcal: number | null };
  macro: MacroSpec | null;
  /**
   * Goal planner: target weight and duration decide the calories; protein from goal and body. `proteinPerKg`
   * null = the personal value; a number = the trainer moved the protein slider.
   */
  plan: { enabled: boolean; targetWeightKg: number | null; weeks: number; experience: TrainingExperience; proteinPerKg: number | null };
}

export const EMPTY_PROFILE: DietProfile = {
  prefs: EMPTY_PREFS,
  split: 'balanced',
  shares: null,
  workoutTime: null,
  cycle: { enabled: false, trainingDays: [0, 2, 4], refeedDay: null, extraKcal: null },
  macro: null,
  plan: { enabled: false, targetWeightKg: null, weeks: 12, experience: 'intermediate', proteinPerKg: null },
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const amount = z.object({ unit: z.enum(['perKg', 'grams', 'percent']), value: z.number().min(0).max(5000) });
const shape = {
  split: z.enum([...SPLIT_PRESETS, 'custom']),
  shares: z.array(z.number().int().min(1).max(100)).min(1).max(8).nullable(),
  workoutTime: time.nullable(),
  cycle: z.object({
    enabled: z.boolean(),
    trainingDays: z.array(z.number().int().min(0).max(6)).max(7),
    refeedDay: z.number().int().min(0).max(6).nullable(),
    extraKcal: z.number().min(0).max(1000).nullable().default(null),
  }),
  macro: z.object({ protein: amount, fat: amount, carb: amount, rest: z.enum(['carb', 'fat']) }).nullable(),
  plan: z.object({
    enabled: z.boolean(),
    targetWeightKg: z.number().min(20).max(400).nullable(),
    weeks: z.number().int().min(1).max(260),
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
    proteinPerKg: z.number().min(0.5).max(5).nullable(),
  }),
};

/** Reads a stored profile field by field; a bad field falls back to its default (never throws). */
export function parseDietProfile(raw: unknown): DietProfile {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_PROFILE };
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...EMPTY_PROFILE, prefs: parseFoodPrefs(src.prefs) };
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const f = shape[key].safeParse(src[key]);
    if (f.success) out[key] = f.data;
  }
  return out as unknown as DietProfile;
}
