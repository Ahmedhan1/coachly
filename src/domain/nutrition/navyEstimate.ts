import type { Sex } from './bmr';
import { DEFAULT_NAVY, navyBodyFat, type NavyCoefficients, type NavyError } from './body';
import { DEFAULT_BODY_INPUT_LIMITS, type BodyInputLimits } from './limits';

export interface DatedMeasures {
  /** YYYY-MM-DD. */
  date: string;
  measurements: { neckCm?: number; waistCm?: number; hipCm?: number; bodyFatPercent?: number };
}

/** Where the body fat used by the planner came from. */
export type BodyFatSource = 'given' | 'navy';

/**
 * Body fat from the US Navy formula using the latest neck, waist (and hip for women) measured on or before the
 * newest entry with all of them. Null when the measurements are missing or the formula rejects them.
 */
export function navyFromMeasures(entries: readonly DatedMeasures[], sex: Sex, heightCm: number, c: NavyCoefficients = DEFAULT_NAVY): number | null {
  const latest = (k: 'neckCm' | 'waistCm' | 'hipCm') => {
    const withIt = entries.filter((e) => e.measurements[k] !== undefined).sort((a, b) => b.date.localeCompare(a.date))[0];
    return withIt?.measurements[k];
  };
  const neckCm = latest('neckCm');
  const waistCm = latest('waistCm');
  const hipCm = latest('hipCm');
  if (neckCm === undefined || waistCm === undefined || (sex === 'female' && hipCm === undefined)) return null;
  const r = navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm: hipCm ?? null }, c);
  return r.ok ? Math.round(r.value * 10) / 10 : null;
}

/** The body fat to plan with: a given value wins; else the Navy estimate; else null. */
export function bodyFatForPlan(
  given: number | null | undefined,
  entries: readonly DatedMeasures[],
  sex: Sex,
  heightCm: number,
  c: NavyCoefficients = DEFAULT_NAVY,
): { bodyFatPercent: number | null; source: BodyFatSource | null } {
  if (given !== null && given !== undefined && given > 0) return { bodyFatPercent: given, source: 'given' };
  const navy = navyFromMeasures(entries, sex, heightCm, c);
  return navy === null ? { bodyFatPercent: null, source: null } : { bodyFatPercent: navy, source: 'navy' };
}

/** The Navy estimate for one progress entry (the entry sheet and imported check-ins). */
export type EntryNavyEstimate =
  | { status: 'estimated'; bodyFatPercent: number }
  /** Neck and waist are there but the formula needs more: the client's gender/height, or (women) the hip. */
  | { status: 'needs'; missing: Array<'gender' | 'height' | 'hip'> }
  | { status: 'invalid'; error: NavyError }
  /** Body fat was typed, or neck/waist are missing: nothing to estimate. */
  | { status: 'none' };

/**
 * Body fat for one entry from its own neck, waist (and hip for women) and the client's height, when no body fat
 * was typed. Rounded to 0.1 %.
 */
export function entryNavyEstimate(
  m: { neckCm?: number; waistCm?: number; hipCm?: number; bodyFatPercent?: number },
  profile: { sex: Sex | null; heightCm: number | undefined },
  c: NavyCoefficients = DEFAULT_NAVY,
  limits: BodyInputLimits = DEFAULT_BODY_INPUT_LIMITS,
): EntryNavyEstimate {
  if (m.bodyFatPercent !== undefined || m.neckCm === undefined || m.waistCm === undefined) return { status: 'none' };
  const missing: Array<'gender' | 'height' | 'hip'> = [];
  if (profile.sex === null) missing.push('gender');
  if (profile.heightCm === undefined) missing.push('height');
  if (profile.sex === 'female' && m.hipCm === undefined) missing.push('hip');
  if (missing.length > 0 || profile.sex === null || profile.heightCm === undefined) return { status: 'needs', missing };
  const r = navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, neckCm: m.neckCm, waistCm: m.waistCm, hipCm: m.hipCm ?? null }, c, limits);
  return r.ok ? { status: 'estimated', bodyFatPercent: Math.round(r.value * 10) / 10 } : { status: 'invalid', error: r.error };
}
