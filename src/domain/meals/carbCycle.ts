import type { KcalPerGramLike, MacroTargets } from './dietTargets';

/** What kind of day a plan day is under carb cycling. */
export type CycleDayType = 'training' | 'rest' | 'refeed';

export interface CycleOptions {
  /** Training days eat this many more calories than rest days (all of it carbs). */
  trainingExtraKcal: number;
  /** Calories on a refeed day (usually maintenance); never below the week's average. */
  refeedKcal: number;
}

export interface CycleResult {
  days: MacroTargets[];
  /** Mean calories of the week (equals the base calories unless a day hit zero carbs). */
  averageKcal: number;
}

/** A day at `kcal` with the base protein and fat; carbs take the rest (never negative). */
function dayAt(base: MacroTargets, kcal: number, kpg: KcalPerGramLike): MacroTargets {
  const k = Math.max(0, kcal);
  const carbG = (k - base.proteinG * kpg.protein - base.fatG * kpg.fat) / kpg.carb;
  if (carbG >= 0) return { kcal: k, proteinG: base.proteinG, fatG: base.fatG, carbG };
  const fatG = Math.max(0, (k - base.proteinG * kpg.protein) / kpg.fat);
  return { kcal: k, proteinG: base.proteinG, fatG, carbG: 0 };
}

/**
 * Carb cycling that keeps the weekly average on the base calories: protein and fat stay the same every day;
 * refeed days eat `refeedKcal`, training days `trainingExtraKcal` more than rest days, and the rest days are set
 * so the week averages out to the base. Carbs follow the calories.
 */
export function cycleTargets(base: MacroTargets, types: readonly CycleDayType[], opts: CycleOptions, kpg: KcalPerGramLike): CycleResult {
  const n = types.length;
  if (n === 0) return { days: [], averageKcal: 0 };
  const refeed = Math.max(base.kcal, opts.refeedKcal);
  const nRef = types.filter((t) => t === 'refeed').length;
  const nTrain = types.filter((t) => t === 'training').length;
  const nRest = n - nRef - nTrain;
  const others = nTrain + nRest;
  const extra = Math.max(0, opts.trainingExtraKcal);
  // Solve nTrain·(rest + extra) + nRest·rest + nRef·refeed = n·base for `rest`.
  const rest = others > 0 ? (n * base.kcal - nRef * refeed - nTrain * extra) / others : base.kcal;
  const kcalOf = (t: CycleDayType) => Math.round(t === 'refeed' ? (others > 0 ? refeed : base.kcal) : t === 'training' ? rest + extra : rest);
  const days = types.map((t) => dayAt(base, kcalOf(t), kpg));
  return { days, averageKcal: days.reduce((a, d) => a + d.kcal, 0) / n };
}

/** The week's day types from the chosen training weekdays and an optional refeed day (plan day indexes). */
export function cycleDayTypes(n: number, trainingDays: readonly number[], refeedDay: number | null): CycleDayType[] {
  const train = new Set(trainingDays);
  return Array.from({ length: n }, (_, i) => (i === refeedDay ? 'refeed' : train.has(i) ? 'training' : 'rest'));
}
