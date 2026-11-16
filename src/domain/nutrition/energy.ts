import { err, ok, type Result } from './result';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh';

/** TDEE = BMR × factor. Trainer-editable defaults. */
export const DEFAULT_ACTIVITY_FACTORS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  veryHigh: 1.9,
};

export type EnergyError = 'invalid_bmr' | 'invalid_activity_factor' | 'invalid_tdee' | 'goal_percent_out_of_range';

export function tdee(
  bmrKcal: number,
  level: ActivityLevel,
  factors: Readonly<Record<ActivityLevel, number>> = DEFAULT_ACTIVITY_FACTORS,
): Result<number, EnergyError> {
  if (!Number.isFinite(bmrKcal) || bmrKcal <= 0) return err('invalid_bmr');
  const factor = factors[level];
  if (!Number.isFinite(factor) || factor <= 0) return err('invalid_activity_factor');
  return ok(bmrKcal * factor);
}

export type Goal = 'cut' | 'maintain' | 'bulk';

export interface PercentRange {
  min: number;
  max: number;
}

/** Slider ranges in percent of TDEE. Trainer-editable defaults. */
export interface GoalRanges {
  cut: PercentRange;
  bulk: PercentRange;
}

export const DEFAULT_GOAL_RANGES: GoalRanges = {
  cut: { min: 15, max: 25 },
  bulk: { min: 5, max: 15 },
};

/**
 * Target calories for a goal. `percent` is the slider value as a positive number
 * (20 means −20 % for a cut, +20 % for a bulk) and is ignored for maintain.
 */
export function goalCalories(
  tdeeKcal: number,
  goal: Goal,
  percent: number,
  ranges: GoalRanges = DEFAULT_GOAL_RANGES,
): Result<number, EnergyError> {
  if (!Number.isFinite(tdeeKcal) || tdeeKcal <= 0) return err('invalid_tdee');
  if (goal === 'maintain') return ok(tdeeKcal);
  const range = ranges[goal];
  if (!Number.isFinite(percent) || percent < range.min || percent > range.max) {
    return err('goal_percent_out_of_range');
  }
  const sign = goal === 'cut' ? -1 : 1;
  return ok(tdeeKcal * (1 + (sign * percent) / 100));
}
