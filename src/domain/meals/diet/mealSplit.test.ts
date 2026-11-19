import { describe, expect, it } from 'vitest';
import { applySplit, carbWeights, defaultDietSettings, mealTarget, mealTargets, normalizeShares, presetShares, setShare, slotsFor, workoutRoles, type MacroTargets } from '..';

const DS = defaultDietSettings();
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const DAY: MacroTargets = { kcal: 2400, proteinG: 170, carbG: 260, fatG: 75 };

describe('per-meal calorie split', () => {
  it('normalises any weights to whole percents summing to 100, each at least the minimum', () => {
    const s = normalizeShares([1, 1, 1], 5);
    expect(sum(s)).toBe(100);
    expect(s).toEqual([34, 33, 33]);
    const tiny = normalizeShares([100, 1, 1, 1], 5);
    expect(sum(tiny)).toBe(100);
    expect(Math.min(...tiny)).toBeGreaterThanOrEqual(5);
  });

  it('moving one meal keeps the day at 100 and spreads the rest by the others’ shares', () => {
    const s = setShare([25, 35, 15, 25], 0, 35, 5);
    expect(s[0]).toBe(35);
    expect(sum(s)).toBe(100);
    expect(s[1]).toBeGreaterThan(s[3] ?? 0);
    const clamped = setShare([25, 35, 15, 25], 2, 99, 5);
    expect(clamped[2]).toBe(85);
    expect(sum(clamped)).toBe(100);
    expect(Math.min(...clamped)).toBe(5);
  });

  it('presets: big breakfast, light dinner and workout-loaded change the shares and still sum to 100', () => {
    const slots = slotsFor('normal', 4, DS);
    const base = slots.map((s) => s.sharePercent);
    expect(presetShares(slots, 'balanced', null)).toEqual(base);
    const bb = presetShares(slots, 'bigBreakfast', null);
    expect(bb[0]).toBeGreaterThan(base[0] ?? 0);
    expect(sum(bb)).toBe(100);
    const ld = presetShares(slots, 'lightDinner', null);
    expect(ld[3]).toBeLessThan(base[3] ?? 0);
    expect(sum(ld)).toBe(100);
    // Training at 16:00: the 14:00 lunch is the pre-workout meal and the 17:00 snack the post-workout one.
    const wk = presetShares(slots, 'workout', '16:00');
    expect(wk[2]).toBeGreaterThan(base[2] ?? 0);
    expect(sum(wk)).toBe(100);
  });

  it('applySplit writes shares and carb weights into the slots', () => {
    const slots = applySplit(slotsFor('normal', 3, DS), [40, 35, 25], '13:00');
    expect(slots.map((s) => s.sharePercent)).toEqual([40, 35, 25]);
    expect(slots[1]?.carbWeight).toBeGreaterThan(1);
    // Bad shares (wrong length) fall back to the layout's own.
    expect(applySplit(slotsFor('normal', 3, DS), [50, 50], null).map((s) => s.sharePercent)).toEqual([30, 40, 30]);
  });

  it('carb weights: meals just before and after training get more carbs', () => {
    const w = carbWeights(slotsFor('normal', 4, DS), '16:00');
    expect(w[2]).toBeGreaterThan(1);
    expect(w[1]).toBeGreaterThan(1);
    expect(w[0]).toBe(1);
    expect(carbWeights(slotsFor('normal', 4, DS), null)).toEqual([1, 1, 1, 1]);
    expect(workoutRoles(slotsFor('normal', 4, DS), '16:00')).toEqual([null, 'pre', 'post', null]);
    // Training late at night: the meal before it is pre, the post meal wraps past midnight only if within 3 h.
    expect(workoutRoles(slotsFor('normal', 4, DS), '22:00')).toEqual([null, null, null, 'pre']);
  });

  it('meal targets: without weights they equal the plain share; with weights carbs move, the day totals and meal calories stay', () => {
    const plain = slotsFor('normal', 4, DS);
    const a = mealTargets(DAY, plain);
    a.forEach((t, i) => expect(t).toEqual(mealTarget(DAY, plain[i]?.sharePercent ?? 0)));
    const weighted = applySplit(plain, plain.map((s) => s.sharePercent), '16:00');
    const b = mealTargets(DAY, weighted);
    expect(sum(b.map((t) => t.carbG))).toBeCloseTo(DAY.carbG, 6);
    expect(sum(b.map((t) => t.fatG))).toBeCloseTo(DAY.fatG, 6);
    b.forEach((t, i) => {
      expect(t.kcal).toBeCloseTo(a[i]?.kcal ?? 0, 6);
      expect(t.fatG).toBeGreaterThanOrEqual(0);
      expect(4 * t.proteinG + 4 * t.carbG + 9 * t.fatG).toBeCloseTo(4 * (a[i]?.proteinG ?? 0) + 4 * (a[i]?.carbG ?? 0) + 9 * (a[i]?.fatG ?? 0), 6);
    });
    expect(b[2]?.carbG ?? 0).toBeGreaterThan(a[2]?.carbG ?? 0);
  });

  it('keeps fat above zero even when nearly all fat would have to move', () => {
    const day: MacroTargets = { kcal: 2000, proteinG: 150, carbG: 400, fatG: 5 };
    const slots = applySplit(slotsFor('normal', 4, DS), [25, 35, 15, 25], '16:00');
    for (const t of mealTargets(day, slots)) expect(t.fatG).toBeGreaterThanOrEqual(0);
  });
});
