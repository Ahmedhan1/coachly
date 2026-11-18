import type { KatchMcArdleCoefficients, MifflinCoefficients, Sex } from './bmr';

/**
 * Goal planner: from today's body, a target weight and a duration, the weekly rate, the daily calories and a
 * week-by-week projection (BMR and burn recomputed as the weight changes). Pure: every coefficient and the
 * current time are passed in.
 */

export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';
export type PlanGoal = 'cut' | 'bulk' | 'recomp' | 'maintain';

export interface GoalPlanCoefficients {
  /** Energy in one kg of weight lost (mostly fat). */
  kcalPerKgLoss: number;
  /** Energy in one kg of lean-gain weight (muscle + some fat + glycogen/water). */
  kcalPerKgGain: number;
  /** Fastest sensible loss, % of body weight per week. */
  maxLossPercentPerWeek: number;
  /** Fastest sensible gain by training age, % of body weight per month. */
  gainCapPercentPerMonth: Record<TrainingExperience, number>;
  /** Share of lost weight that is fat (rest is lean), and share of gained weight that is lean. */
  lossFatShare: number;
  gainLeanShare: number;
  /** Safety floor: never below max(BMR, this). */
  minKcalFemale: number;
  minKcalMale: number;
  /** Recomposition eats this % under the burn (0 = maintenance). */
  recompDeficitPercent: number;
}

export const DEFAULT_GOAL_COEFFICIENTS: GoalPlanCoefficients = {
  kcalPerKgLoss: 7700,
  kcalPerKgGain: 5500,
  maxLossPercentPerWeek: 1,
  gainCapPercentPerMonth: { beginner: 1.5, intermediate: 1, advanced: 0.5 },
  lossFatShare: 0.75,
  gainLeanShare: 0.5,
  minKcalFemale: 1200,
  minKcalMale: 1500,
  recompDeficitPercent: 0,
};

export interface BmrCoefficients {
  mifflin: MifflinCoefficients;
  katch: KatchMcArdleCoefficients;
  /** Use Katch-McArdle (lean mass) when body fat is known. */
  preferKatch: boolean;
}

export interface BodyNow {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** Known or Navy-estimated; null when unknown. */
  bodyFatPercent: number | null;
  /** Burn = BMR × this. */
  activityFactor: number;
}

export interface GoalPlanInput {
  body: BodyNow;
  goal: PlanGoal;
  targetWeightKg: number;
  weeks: number;
  experience: TrainingExperience;
}

export interface GoalWeek {
  week: number;
  weightKg: number;
  bodyFatPercent: number | null;
  bmr: number;
  tdee: number;
  kcal: number;
}

export type GoalFlag = 'loss_too_fast' | 'gain_too_fast' | 'below_floor' | 'wrong_direction';

export interface GoalPlan {
  rateKgPerWeek: number;
  /** Rate as % of today's weight per week. */
  ratePercentPerWeek: number;
  /** Week 1 values. */
  bmr: number;
  tdee: number;
  kcal: number;
  dailyDeltaKcal: number;
  /** Weeks 0..n (week n = the end weight; its kcal is the maintenance-from-then burn). */
  projection: GoalWeek[];
  /** Calories in 4-week blocks (rounded to 10). */
  phases: { fromWeek: number; toWeek: number; kcal: number }[];
  flags: GoalFlag[];
  /** The lowest safe intake in week 1: max(BMR, sex floor). */
  floorKcal: number;
}

export function bmrFor(body: Pick<BodyNow, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPercent'>, c: BmrCoefficients): number {
  if (c.preferKatch && body.bodyFatPercent !== null && body.bodyFatPercent > 0 && body.bodyFatPercent < 70) {
    return c.katch.base + c.katch.perKgLbm * body.weightKg * (1 - body.bodyFatPercent / 100);
  }
  const m = c.mifflin;
  return m.perKg * body.weightKg + m.perCm * body.heightCm - m.perYear * body.ageYears + (body.sex === 'male' ? m.maleConstant : m.femaleConstant);
}

const sexFloor = (sex: Sex, k: GoalPlanCoefficients) => (sex === 'female' ? k.minKcalFemale : k.minKcalMale);

/** The rate the goal asks for, kg/week (0 for recomp and maintain). */
function rateOf(input: GoalPlanInput): number {
  if (input.goal === 'recomp' || input.goal === 'maintain') return 0;
  const weeks = Math.max(1, Math.round(input.weeks));
  return (input.targetWeightKg - input.body.weightKg) / weeks;
}

export function planGoal(input: GoalPlanInput, k: GoalPlanCoefficients, bc: BmrCoefficients): GoalPlan {
  const weeks = Math.max(1, Math.min(260, Math.round(input.weeks)));
  const rate = rateOf(input);
  const density = rate < 0 ? k.kcalPerKgLoss : k.kcalPerKgGain;
  const delta = (rate * density) / 7;
  const recompFactor = input.goal === 'recomp' ? 1 - k.recompDeficitPercent / 100 : 1;
  const projection: GoalWeek[] = [];
  let w = input.body.weightKg;
  const bf0 = input.body.bodyFatPercent;
  let fat = bf0 !== null ? (w * bf0) / 100 : null;
  for (let i = 0; i <= weeks; i++) {
    const bf = fat !== null && w > 0 ? (fat / w) * 100 : null;
    const b = bmrFor({ ...input.body, weightKg: w, bodyFatPercent: bf }, bc);
    const tdee = b * input.body.activityFactor;
    // Never negative (an impossible goal is flagged below_floor instead).
    const kcal = Math.max(0, i === weeks ? tdee : tdee * recompFactor + delta);
    projection.push({ week: i, weightKg: w, bodyFatPercent: bf, bmr: b, tdee, kcal });
    if (i < weeks) {
      if (fat !== null) fat += rate < 0 ? rate * k.lossFatShare : rate * (1 - k.gainLeanShare);
      w += rate;
    }
  }
  const first = projection[0] ?? { bmr: 0, tdee: 0, kcal: 0 };
  const flags: GoalFlag[] = [];
  const w0 = input.body.weightKg;
  const ratePct = w0 > 0 ? (rate / w0) * 100 : 0;
  if ((input.goal === 'cut' && input.targetWeightKg > w0) || (input.goal === 'bulk' && input.targetWeightKg < w0)) flags.push('wrong_direction');
  if (ratePct < -k.maxLossPercentPerWeek) flags.push('loss_too_fast');
  if ((ratePct * 52) / 12 > k.gainCapPercentPerMonth[input.experience]) flags.push('gain_too_fast');
  const floor = (wk: GoalWeek) => Math.max(wk.bmr, sexFloor(input.body.sex, k));
  if (projection.slice(0, weeks).some((wk) => wk.kcal < floor(wk))) flags.push('below_floor');
  const phases: GoalPlan['phases'] = [];
  for (let s = 0; s < weeks; s += 4) {
    const block = projection.slice(s, Math.min(weeks, s + 4));
    const avg = block.reduce((a, wk) => a + wk.kcal, 0) / Math.max(1, block.length);
    phases.push({ fromWeek: s + 1, toWeek: s + block.length, kcal: Math.round(avg / 10) * 10 });
  }
  return {
    rateKgPerWeek: rate,
    ratePercentPerWeek: ratePct,
    bmr: first.bmr,
    tdee: first.tdee,
    kcal: first.kcal,
    dailyDeltaKcal: first.kcal - first.tdee,
    projection,
    phases,
    flags,
    floorKcal: Math.max(first.bmr, sexFloor(input.body.sex, k)),
  };
}

const safe = (p: GoalPlan) => p.flags.every((f) => f === 'wrong_direction');

/** Fewest weeks that reach the target without a safety flag (null when even 5 years is not enough). */
export function realisticWeeks(input: GoalPlanInput, k: GoalPlanCoefficients, bc: BmrCoefficients): number | null {
  if (input.goal === 'recomp' || input.goal === 'maintain') return null;
  for (let wk = 1; wk <= 260; wk++) if (safe(planGoal({ ...input, weeks: wk }, k, bc))) return wk;
  return null;
}

/** The furthest target (towards the asked one) reachable safely in the asked weeks, to 0.1 kg (rounded the safe way). */
export function realisticTarget(input: GoalPlanInput, k: GoalPlanCoefficients, bc: BmrCoefficients): number {
  const w0 = input.body.weightKg;
  if (safe(planGoal(input, k, bc))) return input.targetWeightKg;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (safe(planGoal({ ...input, targetWeightKg: w0 + (input.targetWeightKg - w0) * mid }, k, bc))) lo = mid;
    else hi = mid;
  }
  const v = (w0 + (input.targetWeightKg - w0) * lo) * 10;
  // Round towards today's weight so the rounded target stays safe.
  return (input.targetWeightKg < w0 ? Math.ceil(v) : Math.floor(v)) / 10;
}

/** The weight at a target body fat, keeping today's lean mass. */
export function targetWeightForBodyFat(weightKg: number, bodyFatPercent: number, targetBodyFatPercent: number): number {
  const lean = weightKg * (1 - bodyFatPercent / 100);
  return lean / (1 - Math.min(60, Math.max(3, targetBodyFatPercent)) / 100);
}

const DAY_MS = 86_400_000;

/** Whole weeks from `now` to a YYYY-MM-DD date (at least 1). */
export function weeksUntil(dateIso: string, now: Date): number {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 1;
  return Math.max(1, Math.round((t - now.getTime()) / DAY_MS / 7));
}

/** The date (YYYY-MM-DD) `weeks` weeks after `now`. */
export function dateAfterWeeks(weeks: number, now: Date): string {
  return new Date(now.getTime() + Math.round(weeks) * 7 * DAY_MS).toISOString().slice(0, 10);
}

/** Weekly rate from a daily calorie intake (the "kcal" slider): what the intake does to the weight. */
export function rateFromKcal(kcal: number, tdee: number, k: GoalPlanCoefficients): number {
  const delta = kcal - tdee;
  return (delta * 7) / (delta < 0 ? k.kcalPerKgLoss : k.kcalPerKgGain);
}
