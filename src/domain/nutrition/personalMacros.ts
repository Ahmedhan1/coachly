import type { Sex } from './bmr';
import type { PlanGoal, TrainingExperience } from './goalPlan';

/** Protein and fat by goal and body. All trainer-editable; defaults from sports-nutrition position stands. */
export interface ProteinCoefficients {
  /** Cutting with known body fat: g per kg of fat-free mass (leaner → higher end). */
  cutPerKgFfm: { min: number; max: number };
  /** Cutting without body fat: g per kg of (adjusted) body weight. */
  cutPerKgBw: number;
  /** Bulking: g per kg body weight (beginner → low end, advanced → high end). */
  bulkPerKgBw: { min: number; max: number };
  recompPerKgBw: number;
  maintainPerKgBw: number;
  /** Added per kg from age 50 (anabolic resistance). */
  age50Bonus: number;
  /** From this BMI (or high body fat) protein is counted on an adjusted weight. */
  obeseBmi: number;
  highBodyFat: Record<Sex, number>;
  /** At or under this body fat a cut uses the top of the FFM range. */
  leanBodyFat: Record<Sex, number>;
  /** Fat: at least this per kg of reference weight and this % of the calories. */
  fatPerKg: number;
  fatMinPercent: number;
}

export const DEFAULT_PROTEIN_COEFFICIENTS: ProteinCoefficients = {
  cutPerKgFfm: { min: 2.3, max: 3.1 },
  cutPerKgBw: 2.2,
  bulkPerKgBw: { min: 1.6, max: 2.2 },
  recompPerKgBw: 2.2,
  maintainPerKgBw: 1.8,
  age50Bonus: 0.2,
  obeseBmi: 30,
  highBodyFat: { male: 25, female: 32 },
  leanBodyFat: { male: 10, female: 18 },
  fatPerKg: 0.8,
  fatMinPercent: 20,
};

export interface PersonalBody {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number | null;
}

/** Why this protein (i18n key under nutrition.goal.why) and on what weight it is counted. */
export type ProteinReason = 'cut_ffm' | 'cut_bw' | 'bulk' | 'recomp' | 'maintain';
export type ProteinBasis = 'ffm' | 'bw' | 'adjusted';

export interface PersonalMacros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** Grams per kg of the reference weight. */
  perKg: number;
  basis: ProteinBasis;
  /** Kg the protein is counted on (lean mass, body weight or adjusted weight). */
  refKg: number;
  reason: ProteinReason;
  age50: boolean;
}

/** Devine ideal body weight (kg). */
export function idealWeightKg(sex: Sex, heightCm: number): number {
  return (sex === 'male' ? 50 : 45.5) + 0.9 * (heightCm - 152.4);
}

/** For obesity: ideal weight + 40 % of the excess (common clinical adjusted weight). */
export function adjustedWeightKg(sex: Sex, heightCm: number, weightKg: number): number {
  const ibw = idealWeightKg(sex, heightCm);
  return weightKg > ibw ? ibw + 0.4 * (weightKg - ibw) : weightKg;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const EXP_T: Record<TrainingExperience, number> = { beginner: 0.34, intermediate: 0.67, advanced: 1 };

/**
 * Protein from goal and body, fat from its floor, carbs fill the rest of `kcal`. Cutting with a known body fat
 * counts protein on fat-free mass; otherwise on body weight, or on an adjusted weight for obesity.
 */
export function personalMacros(
  body: PersonalBody,
  goal: PlanGoal,
  experience: TrainingExperience,
  kcal: number,
  c: ProteinCoefficients,
  kpg: { protein: number; carb: number; fat: number },
): PersonalMacros {
  const w = Math.max(1, body.weightKg);
  const bf = body.bodyFatPercent;
  const bmi = body.heightCm > 0 ? w / (body.heightCm / 100) ** 2 : 0;
  const heavy = bmi >= c.obeseBmi || (bf !== null && bf >= c.highBodyFat[body.sex]);
  const bwRef = heavy ? adjustedWeightKg(body.sex, body.heightCm, w) : w;
  const bwBasis: ProteinBasis = heavy && bwRef < w ? 'adjusted' : 'bw';
  let perKg: number;
  let refKg: number;
  let basis: ProteinBasis;
  let reason: ProteinReason;
  if (goal === 'cut' && bf !== null && bf > 0 && bf < 70) {
    const lean = c.leanBodyFat[body.sex];
    const high = c.highBodyFat[body.sex];
    const t = clamp01((bf - lean) / Math.max(1, high - lean));
    perKg = c.cutPerKgFfm.max - t * (c.cutPerKgFfm.max - c.cutPerKgFfm.min);
    refKg = w * (1 - bf / 100);
    basis = 'ffm';
    reason = 'cut_ffm';
  } else {
    refKg = bwRef;
    basis = bwBasis;
    if (goal === 'cut') [perKg, reason] = [c.cutPerKgBw, 'cut_bw'];
    else if (goal === 'bulk') [perKg, reason] = [c.bulkPerKgBw.min + EXP_T[experience] * (c.bulkPerKgBw.max - c.bulkPerKgBw.min), 'bulk'];
    else if (goal === 'recomp') [perKg, reason] = [c.recompPerKgBw, 'recomp'];
    else [perKg, reason] = [c.maintainPerKgBw, 'maintain'];
  }
  const age50 = body.ageYears >= 50;
  if (age50) perKg += c.age50Bonus;
  perKg = r1(perKg);
  const k = Math.max(0, kcal);
  const proteinG = perKg * refKg;
  const fatG = Math.max(c.fatPerKg * (basis === 'ffm' ? bwRef : refKg), (k * c.fatMinPercent) / 100 / kpg.fat);
  const carbG = Math.max(0, (k - proteinG * kpg.protein - fatG * kpg.fat) / kpg.carb);
  return { kcal: k, proteinG, fatG, carbG, perKg, basis, refKg, reason, age50 };
}
