import type { DietSlot } from './dietSlots';
import type { MacroTargets } from './dietTargets';

/** Ready-made ways to spread the day's calories over the meals. */
export const SPLIT_PRESETS = ['balanced', 'bigBreakfast', 'workout', 'lightDinner'] as const;
export type SplitPreset = (typeof SPLIT_PRESETS)[number];

/** Smallest share one meal may have (a meal of 3 % is not a meal). */
export const MIN_SHARE = 5;

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes from the workout to the meal on a 24-hour circle (negative = before training). */
function fromWorkout(slotTime: string, workout: string): number {
  return ((((toMinutes(slotTime) - toMinutes(workout) + 720) % 1440) + 1440) % 1440) - 720;
}

/** Spreads `total` whole percent over the weights (largest remainder), each at least `min`. */
function spread(weights: readonly number[], total: number, min: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const floor = Math.min(min, Math.floor(total / n));
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const fixed = new Array<boolean>(n).fill(false);
  let raw = new Array<number>(n).fill(total / n);
  for (let round = 0; round < n; round++) {
    const freeTotal = total - fixed.reduce((a, f) => a + (f ? floor : 0), 0);
    const freeWeight = w.reduce((a, x, i) => a + (fixed[i] ? 0 : x), 0);
    const freeCount = fixed.filter((f) => !f).length;
    raw = w.map((x, i) => (fixed[i] ? floor : freeWeight > 0 ? (freeTotal * x) / freeWeight : freeTotal / Math.max(1, freeCount)));
    let changed = false;
    raw.forEach((v, i) => {
      if (!fixed[i] && v < floor) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }
  const out = raw.map((v) => Math.floor(v));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) {
    const i = order[k]?.i ?? 0;
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

/** Any weights → whole percents summing to 100, each meal at least `min`. */
export function normalizeShares(weights: readonly number[], min = MIN_SHARE): number[] {
  return spread(weights, 100, min);
}

/**
 * The trainer moves one meal's share: it is clamped so every other meal keeps at least `min`, and the rest of
 * the day is spread over the other meals in proportion to their current shares (the day stays at 100 %).
 */
export function setShare(shares: readonly number[], index: number, value: number, min = MIN_SHARE): number[] {
  const n = shares.length;
  if (index < 0 || index >= n) return [...shares];
  if (n === 1) return [100];
  const v = Math.round(Math.min(100 - min * (n - 1), Math.max(min, value)));
  const others = shares.filter((_, i) => i !== index);
  const rest = spread(others, 100 - v, min);
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) out.push(i === index ? v : (rest[k++] ?? min));
  return out;
}

/** How much more carbs a meal gets: the meal within 3 h before training and the one within 3 h after it. */
const PRE_WEIGHT = 1.4;
const POST_WEIGHT = 1.7;
const WINDOW = 180;

/** Which meal is the pre-workout one and which the post-workout one (null for the others). */
export function workoutRoles(slots: readonly DietSlot[], workoutTime: string | null): ('pre' | 'post' | null)[] {
  const out: ('pre' | 'post' | null)[] = slots.map(() => null);
  if (!workoutTime || !TIME.test(workoutTime)) return out;
  let pre = -1;
  let post = -1;
  let preD = -Infinity;
  let postD = Infinity;
  slots.forEach((s, i) => {
    const d = fromWorkout(s.time, workoutTime);
    if (d < 0 && d >= -WINDOW && d > preD) [pre, preD] = [i, d];
    if (d >= 0 && d <= WINDOW && d < postD) [post, postD] = [i, d];
  });
  if (pre >= 0) out[pre] = 'pre';
  if (post >= 0) out[post] = 'post';
  return out;
}

/** Carb weights per meal for a workout time ("HH:MM"); all 1 without one. */
export function carbWeights(slots: readonly DietSlot[], workoutTime: string | null): number[] {
  return workoutRoles(slots, workoutTime).map((r) => (r === 'pre' ? PRE_WEIGHT : r === 'post' ? POST_WEIGHT : 1));
}

/** Shares for a preset (balanced = the layout's own shares). */
export function presetShares(slots: readonly DietSlot[], preset: SplitPreset, workoutTime: string | null): number[] {
  const base = slots.map((s) => s.sharePercent);
  const last = slots.length - 1;
  if (preset === 'balanced' || slots.length < 2) return base;
  if (preset === 'bigBreakfast') return normalizeShares(base.map((s, i) => (i === 0 ? s * 1.6 : i === last ? s * 0.75 : s)));
  if (preset === 'lightDinner') return normalizeShares(base.map((s, i) => (i === last ? s * 0.6 : s)));
  const w = carbWeights(slots, workoutTime);
  return normalizeShares(base.map((s, i) => s * (w[i] === 1 ? 1 : (w[i] ?? 1) * 0.85)));
}

/**
 * The day's layout with the trainer's shares and the carb weights for the workout time. Shares that do not fit
 * the layout (another number of meals, not summing to 100) are ignored.
 */
export function applySplit(slots: readonly DietSlot[], shares: readonly number[] | null, workoutTime: string | null): DietSlot[] {
  const ok = shares !== null && shares.length === slots.length && shares.reduce((a, b) => a + b, 0) === 100 && shares.every((s) => s >= 1);
  const w = carbWeights(slots, workoutTime);
  return slots.map((s, i) => {
    const out: DietSlot = { ...s, sharePercent: ok ? (shares[i] ?? s.sharePercent) : s.sharePercent };
    if (w[i] !== 1) out.carbWeight = w[i] ?? 1;
    return out;
  });
}

/** Fat may give way to the extra carbs only down to this part of the meal's plain fat share. */
const FAT_KEEP = 0.2;

/**
 * Each meal's targets: calories and protein by its share; carbs by share × carb weight (the day's carbs stay the
 * same); fat moves the other way so each meal keeps its calories. Never below a fifth of the meal's fat share.
 */
export function mealTargets(day: MacroTargets, slots: readonly DietSlot[]): MacroTargets[] {
  const share = slots.map((s) => s.sharePercent / 100);
  const weight = slots.map((s) => (s.carbWeight !== undefined && s.carbWeight > 0 ? s.carbWeight : 1));
  const denom = share.reduce((a, s, i) => a + s * (weight[i] ?? 1), 0);
  const shareSum = share.reduce((a, b) => a + b, 0);
  const flat = weight.every((w) => w === 1);
  const delta = share.map((s, i) => (!flat && denom > 0 ? (day.carbG * s * (weight[i] ?? 1) * shareSum) / denom - day.carbG * s : 0));
  let lambda = 1;
  delta.forEach((d, i) => {
    if (d <= 0) return;
    const room = ((1 - FAT_KEEP) * (share[i] ?? 0) * day.fatG * 9) / (4 * d);
    lambda = Math.min(lambda, room);
  });
  lambda = Math.max(0, lambda);
  return share.map((s, i) => {
    const d = (delta[i] ?? 0) * lambda;
    return { kcal: day.kcal * s, proteinG: day.proteinG * s, carbG: day.carbG * s + d, fatG: Math.max(0, day.fatG * s - (d * 4) / 9) };
  });
}
