import {
  bmi as bmiOf,
  bmr as bmrOf,
  goalCalories,
  leanBodyMassKg,
  macros as macrosOf,
  tdee as tdeeOf,
  waterIntake,
  type ActivityLevel,
  type BmrFormula,
  type EnergyError,
  type Goal,
  type InputError,
  type MacroError,
  type Macros,
  type Result,
  type Sex,
  type WaterRange,
} from '@/domain/nutrition';
import { err, ok } from '@/domain/nutrition';
import type { NutritionSettings } from './settings';

export interface CalcInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number | null;
  formula: BmrFormula;
  activity: ActivityLevel;
  goal: Goal;
  /** Positive slider value; ignored for maintain. */
  goalPercent: number;
  proteinPerKg: number;
  fatPerKg: number;
}

export interface CalcResult {
  bmr: number;
  tdee: number;
  targetKcal: number;
  macros: Macros;
  water: WaterRange;
  bmi: number;
  leanMassKg: number | null;
  activityFactor: number;
}

export type CalcError = InputError | EnergyError | MacroError | 'invalid_coefficient';

/** One line of "how this was calculated": a stable id, the arithmetic with the numbers used, and its result. */
export interface CalcStep {
  id: 'bmr_mifflin' | 'lbm' | 'bmr_katch' | 'tdee' | 'target' | 'protein' | 'fat' | 'carb' | 'water' | 'bmi';
  expression: string;
  result: number;
}

/** Runs the whole chain BMR → TDEE → goal → macros, plus water and BMI, with the trainer's coefficients. */
export function calculate(input: CalcInput, s: NutritionSettings): Result<CalcResult, CalcError> {
  const bmr = bmrOf(
    { sex: input.sex, weightKg: input.weightKg, heightCm: input.heightCm, ageYears: input.ageYears, bodyFatPercent: input.bodyFatPercent, formula: input.formula },
    { mifflin: s.mifflin, katchMcArdle: s.katchMcArdle, limits: s.limits },
  );
  if (!bmr.ok) return bmr;
  // Mifflin ignores age limits only through bmr(); Katch needs them checked too for a consistent experience.
  if (input.formula === 'katch-mcardle' && (input.ageYears < s.limits.minAgeYears || input.ageYears > s.limits.maxAgeYears)) {
    return err('invalid_age');
  }
  const t = tdeeOf(bmr.value, input.activity, s.activityFactors);
  if (!t.ok) return t;
  const target = goalCalories(t.value, input.goal, input.goalPercent, s.goalRanges);
  if (!target.ok) return target;
  const m = macrosOf(
    { calories: target.value, weightKg: input.weightKg, proteinPerKg: input.proteinPerKg, fatPerKg: input.fatPerKg },
    { proteinPerKgRange: s.proteinPerKgRange, fatPerKgRange: s.fatPerKgRange, kcalPerGram: s.kcalPerGram },
  );
  if (!m.ok) return m;
  const water = waterIntake(input.weightKg, s.waterMlPerKg);
  if (!water.ok) return err(water.error === 'invalid_weight' ? 'invalid_weight' : 'invalid_coefficient');
  const b = bmiOf(input.weightKg, input.heightCm, s.limits);
  if (!b.ok) return b;
  const lbm = input.bodyFatPercent === null ? null : leanBodyMassKg(input.weightKg, input.bodyFatPercent, s.limits);
  return ok({
    bmr: bmr.value,
    tdee: t.value,
    targetKcal: target.value,
    macros: m.value,
    water: water.value,
    bmi: b.value,
    leanMassKg: lbm && lbm.ok ? lbm.value : null,
    activityFactor: s.activityFactors[input.activity],
  });
}

const n = (x: number) => String(Number.parseFloat(x.toFixed(2)));
const signed = (x: number) => (x < 0 ? `− ${n(-x)}` : `+ ${n(x)}`);

/** The arithmetic behind a result, in neutral math notation (shown in the app and in the PDF). */
export function calcSteps(input: CalcInput, r: CalcResult, s: NutritionSettings): CalcStep[] {
  const steps: CalcStep[] = [];
  if (input.formula === 'katch-mcardle' && r.leanMassKg !== null) {
    steps.push({ id: 'lbm', expression: `${n(input.weightKg)} × (1 − ${n(input.bodyFatPercent ?? 0)} / 100)`, result: r.leanMassKg });
    steps.push({ id: 'bmr_katch', expression: `${n(s.katchMcArdle.base)} + ${n(s.katchMcArdle.perKgLbm)} × ${n(r.leanMassKg)}`, result: r.bmr });
  } else {
    const c = s.mifflin;
    const constant = input.sex === 'male' ? c.maleConstant : c.femaleConstant;
    steps.push({
      id: 'bmr_mifflin',
      expression: `${n(c.perKg)} × ${n(input.weightKg)} + ${n(c.perCm)} × ${n(input.heightCm)} − ${n(c.perYear)} × ${n(input.ageYears)} ${signed(constant)}`,
      result: r.bmr,
    });
  }
  steps.push({ id: 'tdee', expression: `${n(r.bmr)} × ${n(r.activityFactor)}`, result: r.tdee });
  const pct = input.goal === 'maintain' ? 0 : input.goal === 'cut' ? -input.goalPercent : input.goalPercent;
  steps.push({ id: 'target', expression: `${n(r.tdee)} × (1 ${signed(pct)}%)`, result: r.targetKcal });
  const k = s.kcalPerGram;
  steps.push({ id: 'protein', expression: `${n(input.proteinPerKg)} × ${n(input.weightKg)} = ${n(r.macros.proteinG)} g × ${n(k.protein)}`, result: r.macros.proteinKcal });
  steps.push({ id: 'fat', expression: `${n(input.fatPerKg)} × ${n(input.weightKg)} = ${n(r.macros.fatG)} g × ${n(k.fat)}`, result: r.macros.fatKcal });
  steps.push({
    id: 'carb',
    expression: `(${n(r.targetKcal)} − ${n(r.macros.proteinKcal)} − ${n(r.macros.fatKcal)}) / ${n(k.carb)}`,
    result: r.macros.carbG,
  });
  steps.push({ id: 'water', expression: `${n(input.weightKg)} × ${n(s.waterMlPerKg.min)}–${n(s.waterMlPerKg.max)} ml`, result: r.water.maxMl });
  steps.push({ id: 'bmi', expression: `${n(input.weightKg)} / (${n(input.heightCm)} / 100)²`, result: r.bmi });
  return steps;
}

/** Share of each macro in the target calories (0..1 each, summing to 1 unless all are zero). */
export function macroShares(m: Pick<Macros, 'proteinKcal' | 'carbKcal' | 'fatKcal'>): { protein: number; carb: number; fat: number } {
  const total = m.proteinKcal + m.carbKcal + m.fatKcal;
  if (!(total > 0)) return { protein: 0, carb: 0, fat: 0 };
  return { protein: m.proteinKcal / total, carb: m.carbKcal / total, fat: m.fatKcal / total };
}

/** Katch-McArdle when body fat is known (if the trainer wants that), never without it; else the default formula. */
export function defaultFormulaFor(bodyFatPercent: number | null | undefined, s: NutritionSettings): BmrFormula {
  const known = bodyFatPercent !== null && bodyFatPercent !== undefined;
  if (known && s.preferKatchWhenBodyFat) return 'katch-mcardle';
  if (!known && s.defaultFormula === 'katch-mcardle') return 'mifflin-st-jeor';
  return s.defaultFormula;
}
