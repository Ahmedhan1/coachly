/** "Nice" axis ticks (steps of 1, 2, 2.5 or 5 × 10^n) covering [min, max]. */
export interface NiceTicks {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

const NICE = [1, 2, 2.5, 5, 10];

function niceStep(rawStep: number): number {
  const power = Math.floor(Math.log10(rawStep));
  const base = 10 ** power;
  const fraction = rawStep / base;
  const nice = NICE.find((n) => fraction <= n) ?? 10;
  return nice * base;
}

/** Rounds away floating-point noise such as 0.30000000000000004. */
function clean(x: number): number {
  return Number.parseFloat(x.toPrecision(12));
}

/**
 * Ticks for a value axis. `maxCount` is an upper bound on the number of intervals.
 * A flat range (min === max) is widened by 1 on each side so the line sits in the middle.
 */
export function niceTicks(min: number, max: number, maxCount = 4): NiceTicks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new RangeError('non-finite extent');
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const count = Math.max(1, Math.floor(maxCount));
  let step = niceStep((hi - lo) / count);
  let start = Math.floor(lo / step) * step;
  let end = Math.ceil(hi / step) * step;
  // A nice step can still produce one interval too many; widen once if so.
  if (Math.round((end - start) / step) > count) {
    step = niceStep(step * 1.01);
    start = Math.floor(lo / step) * step;
    end = Math.ceil(hi / step) * step;
  }
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(clean(v));
  return { min: clean(start), max: clean(end), step: clean(step), ticks };
}

/**
 * Evenly spaced day ticks between two day numbers (inclusive ends), at most `maxCount` of them.
 * Always includes the first and last day when they differ.
 */
export function dayTicks(firstDay: number, lastDay: number, maxCount = 4): number[] {
  if (!Number.isInteger(firstDay) || !Number.isInteger(lastDay)) throw new RangeError('days must be integers');
  if (lastDay <= firstDay) return [firstDay];
  const count = Math.max(2, Math.floor(maxCount));
  const span = lastDay - firstDay;
  const intervals = Math.min(count - 1, span);
  const out: number[] = [];
  for (let i = 0; i <= intervals; i++) out.push(firstDay + Math.round((span * i) / intervals));
  return [...new Set(out)];
}
