import type { Sex } from './bmr';
import { DEFAULT_NAVY, navyBodyFat, type NavyCoefficients } from './body';

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
