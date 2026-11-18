import {
  DEFAULT_PROTEIN_COEFFICIENTS,
  personalMacros,
  planGoal,
  type BmrCoefficients,
  type BodyNow,
  type GoalPlan,
  type GoalPlanCoefficients,
  type PersonalMacros,
  type PlanGoal,
  type ProteinCoefficients,
  type TrainingExperience,
} from '@/domain/nutrition';
import type { MacroTargets } from './dietTargets';
import type { DietSettings } from './dietSettings';
import type { NutritionSettings } from './settings';

/** The goal planner's coefficients from the trainer's diet settings. */
export function goalCoefficientsFrom(ds: DietSettings): GoalPlanCoefficients {
  return {
    kcalPerKgLoss: ds.kcalPerKgChange,
    kcalPerKgGain: ds.kcalPerKgGain,
    maxLossPercentPerWeek: ds.maxLossPercentPerWeek,
    gainCapPercentPerMonth: { beginner: ds.gainCapBeginner, intermediate: ds.gainCapIntermediate, advanced: ds.gainCapAdvanced },
    lossFatShare: ds.lossFatShare,
    gainLeanShare: ds.gainLeanShare,
    minKcalFemale: ds.minKcalFemale,
    minKcalMale: ds.minKcalMale,
    recompDeficitPercent: ds.recompDeficitPercent,
  };
}

export function proteinCoefficientsFrom(ds: DietSettings): ProteinCoefficients {
  return {
    ...DEFAULT_PROTEIN_COEFFICIENTS,
    cutPerKgFfm: { min: ds.protCutFfmMin, max: ds.protCutFfmMax },
    cutPerKgBw: ds.protCutBw,
    bulkPerKgBw: { min: ds.protBulkMin, max: ds.protBulkMax },
    recompPerKgBw: ds.protRecomp,
    maintainPerKgBw: ds.protMaintain,
    age50Bonus: ds.protAge50Bonus,
    obeseBmi: ds.obeseBmi,
    fatPerKg: ds.fatFloorPerKg,
    fatMinPercent: ds.fatMinPercent,
  };
}

export function bmrCoefficientsFrom(s: NutritionSettings): BmrCoefficients {
  return { mifflin: s.mifflin, katch: s.katchMcArdle, preferKatch: s.preferKatchWhenBodyFat };
}

export interface GoalDietInput {
  body: BodyNow;
  goal: PlanGoal;
  /** Null = a sensible start: 6 % under for a cut, 4 % over for a bulk, today's weight otherwise. */
  targetWeightKg: number | null;
  weeks: number;
  experience: TrainingExperience;
  /** The trainer's protein (g/kg of the reference weight); null = personal value. */
  proteinPerKg: number | null;
}

export interface GoalDiet {
  targetWeightKg: number;
  plan: GoalPlan;
  macros: PersonalMacros;
  targets: MacroTargets;
}

export function defaultTargetWeight(goal: PlanGoal, weightKg: number): number {
  const k = goal === 'cut' ? 0.94 : goal === 'bulk' ? 1.04 : 1;
  return Math.round(weightKg * k * 2) / 2;
}

/** Goal plan → week-1 calories → personal protein/fat/carbs (protein overridable). */
export function goalDiet(input: GoalDietInput, s: NutritionSettings, ds: DietSettings): GoalDiet {
  const targetWeightKg = input.targetWeightKg ?? defaultTargetWeight(input.goal, input.body.weightKg);
  const plan = planGoal({ body: input.body, goal: input.goal, targetWeightKg, weeks: input.weeks, experience: input.experience }, goalCoefficientsFrom(ds), bmrCoefficientsFrom(s));
  const kcal = Math.round(plan.kcal);
  const kpg = s.kcalPerGram;
  const base = personalMacros(input.body, input.goal, input.experience, kcal, proteinCoefficientsFrom(ds), kpg);
  let macros = base;
  if (input.proteinPerKg !== null) {
    const proteinG = input.proteinPerKg * base.refKg;
    macros = { ...base, perKg: input.proteinPerKg, proteinG, carbG: Math.max(0, (kcal - proteinG * kpg.protein - base.fatG * kpg.fat) / kpg.carb) };
  }
  return { targetWeightKg, plan, macros, targets: { kcal, proteinG: macros.proteinG, fatG: macros.fatG, carbG: macros.carbG } };
}
