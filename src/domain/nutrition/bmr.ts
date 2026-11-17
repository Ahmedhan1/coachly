import {
  checkAge,
  checkBodyFatPercent,
  checkHeight,
  checkWeight,
  DEFAULT_BODY_INPUT_LIMITS,
  type BodyInputLimits,
  type InputError,
} from './limits';
import { ok, type Result } from './result';

export type Sex = 'male' | 'female';
export type BmrFormula = 'mifflin-st-jeor' | 'katch-mcardle';

/** BMR = perKg*W + perCm*H - perYear*A + (maleConstant | femaleConstant). */
export interface MifflinCoefficients {
  perKg: number;
  perCm: number;
  perYear: number;
  maleConstant: number;
  femaleConstant: number;
}

export const DEFAULT_MIFFLIN: MifflinCoefficients = {
  perKg: 10,
  perCm: 6.25,
  perYear: 5,
  maleConstant: 5,
  femaleConstant: -161,
};

/** BMR = base + perKgLbm * LBM. */
export interface KatchMcArdleCoefficients {
  base: number;
  perKgLbm: number;
}

export const DEFAULT_KATCH_MCARDLE: KatchMcArdleCoefficients = { base: 370, perKgLbm: 21.6 };

export interface MifflinInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

export function mifflinStJeor(
  input: MifflinInput,
  c: MifflinCoefficients = DEFAULT_MIFFLIN,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): Result<number, InputError> {
  const w = checkWeight(input.weightKg, limits);
  if (!w.ok) return w;
  const h = checkHeight(input.heightCm, limits);
  if (!h.ok) return h;
  const a = checkAge(input.ageYears, limits);
  if (!a.ok) return a;
  const constant = input.sex === 'male' ? c.maleConstant : c.femaleConstant;
  return ok(c.perKg * w.value + c.perCm * h.value - c.perYear * a.value + constant);
}

/** Lean body mass in kg: W * (1 - BF/100). `bodyFatPercent` is e.g. 20 for 20 %. */
export function leanBodyMassKg(
  weightKg: number,
  bodyFatPercent: number | null | undefined,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): Result<number, InputError> {
  const w = checkWeight(weightKg, limits);
  if (!w.ok) return w;
  const bf = checkBodyFatPercent(bodyFatPercent);
  if (!bf.ok) return bf;
  return ok(w.value * (1 - bf.value / 100));
}

export interface KatchMcArdleInput {
  weightKg: number;
  bodyFatPercent: number | null | undefined;
}

export function katchMcArdle(
  input: KatchMcArdleInput,
  c: KatchMcArdleCoefficients = DEFAULT_KATCH_MCARDLE,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): Result<number, InputError> {
  const lbm = leanBodyMassKg(input.weightKg, input.bodyFatPercent, limits);
  if (!lbm.ok) return lbm;
  return ok(c.base + c.perKgLbm * lbm.value);
}

export interface BmrInput extends MifflinInput {
  bodyFatPercent?: number | null;
  formula?: BmrFormula;
}

export interface BmrOptions {
  mifflin?: MifflinCoefficients;
  katchMcArdle?: KatchMcArdleCoefficients;
  limits?: BodyInputLimits;
}

/** BMR with the selected formula (default Mifflin-St Jeor). */
export function bmr(input: BmrInput, options: BmrOptions = {}): Result<number, InputError> {
  const limits = options.limits ?? DEFAULT_BODY_INPUT_LIMITS;
  if (input.formula === 'katch-mcardle') {
    return katchMcArdle({ weightKg: input.weightKg, bodyFatPercent: input.bodyFatPercent }, options.katchMcArdle ?? DEFAULT_KATCH_MCARDLE, limits);
  }
  return mifflinStJeor(input, options.mifflin ?? DEFAULT_MIFFLIN, limits);
}
