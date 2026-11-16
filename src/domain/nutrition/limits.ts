import { err, ok, type Result } from './result';

/** Accepted input ranges. Trainer-editable; these are the defaults. */
export interface BodyInputLimits {
  minWeightKg: number;
  maxWeightKg: number;
  minHeightCm: number;
  maxHeightCm: number;
  /** Mifflin-St Jeor and Katch-McArdle are validated on adults; younger ages are rejected. */
  minAgeYears: number;
  maxAgeYears: number;
}

export const DEFAULT_BODY_INPUT_LIMITS: BodyInputLimits = {
  minWeightKg: 20,
  maxWeightKg: 400,
  minHeightCm: 100,
  maxHeightCm: 250,
  minAgeYears: 15,
  maxAgeYears: 100,
};

export type InputError = 'invalid_weight' | 'invalid_height' | 'invalid_age' | 'invalid_body_fat' | 'missing_body_fat';

function inRange(x: number, min: number, max: number): boolean {
  return Number.isFinite(x) && x >= min && x <= max;
}

export function checkWeight(kg: number, limits: BodyInputLimits): Result<number, 'invalid_weight'> {
  return inRange(kg, limits.minWeightKg, limits.maxWeightKg) ? ok(kg) : err('invalid_weight');
}

export function checkHeight(cm: number, limits: BodyInputLimits): Result<number, 'invalid_height'> {
  return inRange(cm, limits.minHeightCm, limits.maxHeightCm) ? ok(cm) : err('invalid_height');
}

export function checkAge(years: number, limits: BodyInputLimits): Result<number, 'invalid_age'> {
  return inRange(years, limits.minAgeYears, limits.maxAgeYears) ? ok(years) : err('invalid_age');
}

/** Body fat as a percentage (e.g. 20 for 20 %). Must be in (0, 75). */
export function checkBodyFatPercent(
  percent: number | null | undefined,
): Result<number, 'invalid_body_fat' | 'missing_body_fat'> {
  if (percent === null || percent === undefined) return err('missing_body_fat');
  return Number.isFinite(percent) && percent > 0 && percent < 75 ? ok(percent) : err('invalid_body_fat');
}
