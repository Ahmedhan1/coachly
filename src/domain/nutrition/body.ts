import { checkHeight, checkWeight, DEFAULT_BODY_INPUT_LIMITS, type BodyInputLimits } from './limits';
import { err, ok, type Result } from './result';
import type { Sex } from './bmr';

/** BMI = W / (H/100)^2. */
export function bmi(
  weightKg: number,
  heightCm: number,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): Result<number, 'invalid_weight' | 'invalid_height'> {
  const w = checkWeight(weightKg, limits);
  if (!w.ok) return w;
  const h = checkHeight(heightCm, limits);
  if (!h.ok) return h;
  const m = h.value / 100;
  return ok(w.value / (m * m));
}

/**
 * US Navy body-fat, metric (cm) form (Hodgdon & Beckett 1984, as published by the US Navy / Army):
 *   male:   BF% = 495 / (a - b*log10(waist - neck) + c*log10(height)) - 450
 *   female: BF% = 495 / (a - b*log10(waist + hip - neck) + c*log10(height)) - 450
 */
export interface NavyCoefficients {
  numerator: number;
  offset: number;
  male: { a: number; b: number; c: number };
  female: { a: number; b: number; c: number };
}

export const DEFAULT_NAVY: NavyCoefficients = {
  numerator: 495,
  offset: 450,
  male: { a: 1.0324, b: 0.19077, c: 0.15456 },
  female: { a: 1.29579, b: 0.35004, c: 0.221 },
};

export interface NavyInput {
  sex: Sex;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  /** Required for female. */
  hipCm?: number | null;
}

export type NavyError =
  | 'invalid_height'
  | 'invalid_circumference'
  | 'missing_hip'
  | 'waist_not_greater_than_neck'
  | 'result_out_of_range';

function positive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/** Body fat in percent (e.g. 16.4). */
export function navyBodyFat(
  input: NavyInput,
  c: NavyCoefficients = DEFAULT_NAVY,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): Result<number, NavyError> {
  const h = checkHeight(input.heightCm, limits);
  if (!h.ok) return h;
  if (!positive(input.neckCm) || !positive(input.waistCm)) return err('invalid_circumference');

  let girth: number;
  let k: { a: number; b: number; c: number };
  if (input.sex === 'male') {
    if (input.waistCm <= input.neckCm) return err('waist_not_greater_than_neck');
    girth = input.waistCm - input.neckCm;
    k = c.male;
  } else {
    const hip = input.hipCm;
    if (hip === null || hip === undefined) return err('missing_hip');
    if (!positive(hip)) return err('invalid_circumference');
    if (input.waistCm + hip <= input.neckCm) return err('waist_not_greater_than_neck');
    girth = input.waistCm + hip - input.neckCm;
    k = c.female;
  }
  const density = k.a - k.b * Math.log10(girth) + k.c * Math.log10(h.value);
  if (!(density > 0)) return err('result_out_of_range');
  const bf = c.numerator / density - c.offset;
  if (!Number.isFinite(bf) || bf <= 0 || bf >= 75) return err('result_out_of_range');
  return ok(bf);
}
