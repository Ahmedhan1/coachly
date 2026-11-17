import { err, ok, type Result } from './result';

/** Daily water starting point, ml per kg body weight. Trainer-editable. */
export const DEFAULT_WATER_ML_PER_KG = { min: 30, max: 35 } as const;

export interface WaterRange {
  minMl: number;
  maxMl: number;
}

export function waterIntake(
  weightKg: number,
  mlPerKg: { min: number; max: number } = DEFAULT_WATER_ML_PER_KG,
): Result<WaterRange, 'invalid_weight' | 'invalid_coefficient'> {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return err('invalid_weight');
  if (!(mlPerKg.min > 0) || !(mlPerKg.max >= mlPerKg.min)) return err('invalid_coefficient');
  return ok({ minMl: weightKg * mlPerKg.min, maxMl: weightKg * mlPerKg.max });
}
