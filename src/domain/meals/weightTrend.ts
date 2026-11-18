import type { DietSettings } from './dietSettings';
import type { DietGoal } from './dietTargets';

export interface WeighIn {
  /** "YYYY-MM-DD". */
  date: string;
  weightKg: number;
}

export interface WeightTrend {
  /** Fitted change per week, kg (negative = losing). */
  kgPerWeek: number;
  /** Same as a share of the latest weight, %. */
  percentPerWeek: number;
  /** Days between the first and the last weigh-in used. */
  spanDays: number;
  points: number;
  latestKg: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Weeks of weigh-ins the trend looks at. */
export const TREND_WINDOW_DAYS = 28;
/** The trend needs weigh-ins at least this many days apart. */
export const MIN_SPAN_DAYS = 10;

/**
 * Weekly weight trend from weigh-ins in the last `windowDays` before `now` (least-squares line, so one heavy
 * day after a salty meal does not decide it). Null when there is not enough to judge.
 */
export function weightTrend(entries: readonly WeighIn[], now: Date, windowDays = TREND_WINDOW_DAYS): WeightTrend | null {
  const today = Math.floor(now.getTime() / DAY_MS);
  const pts = entries
    .filter((e) => Number.isFinite(e.weightKg) && e.weightKg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map((e) => ({ x: dayNumber(e.date), y: e.weightKg }))
    .filter((p) => Number.isFinite(p.x) && p.x <= today && p.x > today - windowDays)
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return null;
  const span = last.x - first.x;
  if (span < MIN_SPAN_DAYS) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  const perDay = sxx > 0 ? sxy / sxx : 0;
  const kgPerWeek = perDay * 7;
  return { kgPerWeek, percentPerWeek: (kgPerWeek / last.y) * 100, spanDays: span, points: n, latestKg: last.y };
}

/** The weekly change the goal aims for, as % of body weight (negative = loss). */
export function goalRate(goal: DietGoal, ds: DietSettings): { min: number; max: number } {
  if (goal === 'cut') return { min: -ds.cutRateMaxPercent, max: -ds.cutRateMinPercent };
  if (goal === 'bulk') return { min: ds.bulkRateMinPercent, max: ds.bulkRateMaxPercent };
  return { min: -ds.maintainBandPercent, max: ds.maintainBandPercent };
}

/** Why a change is suggested (i18n key under nutrition.cal.trend). */
export type TrendReason = 'stalled' | 'tooSlow' | 'tooFast' | 'drifting_up' | 'drifting_down';

export interface KcalSuggestion {
  reason: TrendReason;
  /** Calories per day to add (positive) or remove (negative), rounded to 50. */
  deltaKcal: number;
  /** Whole weeks the trend covers (for "two weeks stable"). */
  weeks: number;
}

/** Under this weekly change (% of body weight) the weight counts as "stable". */
const STABLE_PERCENT = 0.1;
const MIN_STEP = 100;
const MAX_STEP = 300;

/**
 * A calorie change that would bring the trend back into the goal's range, sized from the energy in a kilo of
 * body weight, rounded to 50 and kept between 100 and 300 a day. Null when the trend is on target. It is only a
 * suggestion: the trainer applies it.
 */
export function suggestKcalChange(trend: WeightTrend, goal: DietGoal, ds: DietSettings): KcalSuggestion | null {
  const r = goalRate(goal, ds);
  const rate = trend.percentPerWeek;
  if (rate >= r.min && rate <= r.max) return null;
  const aim = rate < r.min ? r.min : r.max;
  const gapKgPerWeek = ((aim - rate) / 100) * trend.latestKg;
  const raw = (gapKgPerWeek * ds.kcalPerKgChange) / 7;
  const size = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.round(Math.abs(raw) / 50) * 50));
  const deltaKcal = Math.sign(raw) * size;
  const weeks = Math.max(1, Math.floor(trend.spanDays / 7));
  let reason: TrendReason;
  if (goal === 'cut') reason = rate > r.max ? (Math.abs(rate) < STABLE_PERCENT ? 'stalled' : rate > 0 ? 'drifting_up' : 'tooSlow') : 'tooFast';
  else if (goal === 'bulk') reason = rate < r.min ? (Math.abs(rate) < STABLE_PERCENT ? 'stalled' : rate < 0 ? 'drifting_down' : 'tooSlow') : 'tooFast';
  else reason = rate > r.max ? 'drifting_up' : 'drifting_down';
  return { reason, deltaKcal, weeks };
}
