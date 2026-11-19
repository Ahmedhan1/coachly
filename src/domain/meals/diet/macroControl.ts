import type { DietSettings } from './dietSettings';
import type { DietGoal, KcalPerGramLike, MacroTargets } from './dietTargets';

/** How the trainer typed one macro: grams per kg of body weight, total grams, or % of the day's calories. */
export type MacroUnit = 'perKg' | 'grams' | 'percent';

export interface MacroAmount {
  unit: MacroUnit;
  value: number;
}

/**
 * The trainer's own macro split. Protein is always set; then either fat is set and carbs fill the rest of the
 * calories (`rest: 'carb'`), or carbs are set and fat fills the rest (`rest: 'fat'`).
 */
export interface MacroSpec {
  protein: MacroAmount;
  fat: MacroAmount;
  carb: MacroAmount;
  rest: 'carb' | 'fat';
}

/** Targets plus the calories the set macros go over the day's calories by (0 when they fit). */
export interface SpecTargets extends MacroTargets {
  overflowKcal: number;
}

function grams(a: MacroAmount, kcal: number, weightKg: number, kcalPerGram: number): number {
  const v = Math.max(0, Number.isFinite(a.value) ? a.value : 0);
  if (a.unit === 'perKg') return v * weightKg;
  if (a.unit === 'percent') return (kcal * v) / 100 / kcalPerGram;
  return v;
}

/** Day targets from the trainer's split; the remainder macro never goes negative (the overflow is reported). */
export function macroTargetsFromSpec(kcal: number, weightKg: number, spec: MacroSpec, kpg: KcalPerGramLike): SpecTargets {
  const k = Math.max(0, kcal);
  const proteinG = grams(spec.protein, k, weightKg, kpg.protein);
  if (spec.rest === 'carb') {
    const fatG = grams(spec.fat, k, weightKg, kpg.fat);
    const left = k - proteinG * kpg.protein - fatG * kpg.fat;
    return { kcal: k, proteinG, fatG, carbG: Math.max(0, left / kpg.carb), overflowKcal: Math.max(0, -left) };
  }
  const carbG = grams(spec.carb, k, weightKg, kpg.carb);
  const left = k - proteinG * kpg.protein - carbG * kpg.carb;
  return { kcal: k, proteinG, carbG, fatG: Math.max(0, left / kpg.fat), overflowKcal: Math.max(0, -left) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function amountOf(g: number, unit: MacroUnit, kcal: number, weightKg: number, kcalPerGram: number): MacroAmount {
  if (unit === 'perKg') return { unit, value: weightKg > 0 ? round1(g / weightKg) : 0 };
  if (unit === 'percent') return { unit, value: kcal > 0 ? Math.round(((g * kcalPerGram) / kcal) * 100) : 0 };
  return { unit, value: Math.round(g) };
}

/** A spec that reproduces the current targets (rounded) in the units the trainer picked. */
export function macroSpecFrom(
  t: MacroTargets,
  weightKg: number,
  units: { protein: MacroUnit; fat: MacroUnit; carb: MacroUnit },
  rest: MacroSpec['rest'],
  kpg: KcalPerGramLike,
): MacroSpec {
  return {
    protein: amountOf(t.proteinG, units.protein, t.kcal, weightKg, kpg.protein),
    fat: amountOf(t.fatG, units.fat, t.kcal, weightKg, kpg.fat),
    carb: amountOf(t.carbG, units.carb, t.kcal, weightKg, kpg.carb),
    rest,
  };
}

/** Converts one macro amount to another unit (same grams), for when the trainer switches g/kg ↔ g ↔ %. */
export function convertAmount(a: MacroAmount, to: MacroUnit, kcal: number, weightKg: number, kcalPerGram: number): MacroAmount {
  return amountOf(grams(a, kcal, weightKg, kcalPerGram), to, kcal, weightKg, kcalPerGram);
}

export type MacroControlWarning = 'protein_low_cut' | 'protein_low' | 'protein_very_high' | 'fat_low' | 'fat_high' | 'carb_zero' | 'over_kcal';

export interface MacroWarnContext {
  goal: DietGoal;
  weightKg: number;
  sex: 'male' | 'female';
  overflowKcal: number;
}

/** Friendly checks on a hand-made split (bounds come from the trainer's diet settings). Empty = nothing unusual. */
export function macroControlWarnings(t: MacroTargets, ctx: MacroWarnContext, ds: DietSettings, kpg: KcalPerGramLike): MacroControlWarning[] {
  const out: MacroControlWarning[] = [];
  const w = Math.max(1, ctx.weightKg);
  const pKg = t.proteinG / w;
  if (ctx.goal === 'cut' && pKg < ds.cutMinProteinPerKg) out.push('protein_low_cut');
  else if (pKg < ds.minProteinPerKg) out.push('protein_low');
  if (pKg > ds.maxProteinPerKg) out.push('protein_very_high');
  if (t.fatG / w < ds.minFatPerKg) out.push('fat_low');
  if (t.kcal > 0 && ((t.fatG * kpg.fat) / t.kcal) * 100 > ds.maxFatPercent) out.push('fat_high');
  if (t.carbG < 1) out.push('carb_zero');
  if (ctx.overflowKcal > 0) out.push('over_kcal');
  return out;
}
