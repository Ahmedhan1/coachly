import { err, ok, type Result } from '../nutrition/result';

/** Epley: 1RM = w × (1 + reps / divisor). Trainer-editable divisor. */
export const DEFAULT_EPLEY_DIVISOR = 30;

export type OneRepMaxError = 'invalid_weight' | 'invalid_reps';

/** Epley estimate. A single rep returns the weight itself (the plain formula would add 1/30). */
export function epleyOneRepMax(
  weightKg: number,
  reps: number,
  divisor: number = DEFAULT_EPLEY_DIVISOR,
): Result<number, OneRepMaxError> {
  if (!Number.isFinite(weightKg) || weightKg < 0) return err('invalid_weight');
  if (!Number.isInteger(reps) || reps < 1) return err('invalid_reps');
  return ok(estimateOneRepMax(weightKg, reps, divisor));
}

/** Unchecked variant for already-validated logged sets. */
export function estimateOneRepMax(weightKg: number, reps: number, divisor: number = DEFAULT_EPLEY_DIVISOR): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / divisor);
}
