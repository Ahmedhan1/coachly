import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOAL_COEFFICIENTS,
  DEFAULT_KATCH_MCARDLE,
  DEFAULT_MIFFLIN,
  DEFAULT_PROTEIN_COEFFICIENTS,
  adjustedWeightKg,
  bmrFor,
  dateAfterWeeks,
  personalMacros,
  planGoal,
  rateFromKcal,
  realisticTarget,
  realisticWeeks,
  targetWeightForBodyFat,
  weeksUntil,
  type BodyNow,
  type GoalPlanInput,
} from '.';

const K = DEFAULT_GOAL_COEFFICIENTS;
const BC = { mifflin: DEFAULT_MIFFLIN, katch: DEFAULT_KATCH_MCARDLE, preferKatch: true };
const KPG = { protein: 4, carb: 4, fat: 9 };
const MAN: BodyNow = { sex: 'male', ageYears: 30, heightCm: 178, weightKg: 90, bodyFatPercent: null, activityFactor: 1.55 };
const cut = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({ body: MAN, goal: 'cut', targetWeightKg: 84, weeks: 12, experience: 'intermediate', ...over });

describe('goal planner', () => {
  it('BMR: Mifflin without body fat, Katch-McArdle with it', () => {
    expect(bmrFor(MAN, BC)).toBeCloseTo(10 * 90 + 6.25 * 178 - 5 * 30 + 5, 6);
    expect(bmrFor({ ...MAN, bodyFatPercent: 20 }, BC)).toBeCloseTo(370 + 21.6 * 72, 6);
  });

  it('cut: weekly rate, daily deficit from 7700 kcal/kg, week 1 kcal = burn − deficit', () => {
    const p = planGoal(cut(), K, BC);
    expect(p.rateKgPerWeek).toBeCloseTo(-0.5, 6);
    expect(p.ratePercentPerWeek).toBeCloseTo(-0.5 / 0.9, 6);
    expect(p.dailyDeltaKcal).toBeCloseTo((-0.5 * 7700) / 7, 6);
    expect(p.kcal).toBeCloseTo(p.tdee - 550, 6);
    expect(p.flags).toEqual([]);
  });

  it('adapts week by week: the burn falls as the weight falls; projection ends on the target', () => {
    const p = planGoal(cut(), K, BC);
    expect(p.projection).toHaveLength(13);
    expect(p.projection[12]?.weightKg).toBeCloseTo(84, 6);
    expect(p.projection[11]?.tdee ?? 0).toBeLessThan(p.projection[0]?.tdee ?? 0);
    expect(p.phases.map((x) => [x.fromWeek, x.toWeek])).toEqual([
      [1, 4],
      [5, 8],
      [9, 12],
    ]);
    expect(p.phases[2]?.kcal ?? 0).toBeLessThan(p.phases[0]?.kcal ?? 0);
  });

  it('lean gain: 5500 kcal/kg surplus, capped by training age', () => {
    const p = planGoal({ ...cut(), goal: 'bulk', targetWeightKg: 92, weeks: 16, experience: 'beginner' }, K, BC);
    expect(p.dailyDeltaKcal).toBeCloseTo((0.125 * 5500) / 7, 6);
    expect(p.flags).toEqual([]);
    const adv = planGoal({ ...cut(), goal: 'bulk', targetWeightKg: 94, weeks: 12, experience: 'advanced' }, K, BC);
    expect(adv.flags).toContain('gain_too_fast');
  });

  it('flags: too fast a loss, under the floor, wrong direction', () => {
    const p = planGoal(cut({ targetWeightKg: 75, weeks: 8 }), K, BC);
    expect(p.flags).toContain('loss_too_fast');
    expect(p.flags).toContain('below_floor');
    expect(planGoal(cut({ targetWeightKg: 95 }), K, BC).flags).toContain('wrong_direction');
  });

  it('realistic date and realistic target fix an unsafe goal', () => {
    const asked = cut({ targetWeightKg: 75, weeks: 8 });
    const wk = realisticWeeks(asked, K, BC);
    expect(wk).not.toBeNull();
    expect(planGoal({ ...asked, weeks: wk ?? 0 }, K, BC).flags).toEqual([]);
    expect(planGoal({ ...asked, weeks: (wk ?? 2) - 1 }, K, BC).flags.length).toBeGreaterThan(0);
    const tg = realisticTarget(asked, K, BC);
    expect(tg).toBeGreaterThan(75);
    expect(tg).toBeLessThan(90);
    expect(planGoal({ ...asked, targetWeightKg: tg }, K, BC).flags).toEqual([]);
  });

  it('recomp and maintain stay at the burn', () => {
    const p = planGoal(cut({ goal: 'maintain', targetWeightKg: 90 }), K, BC);
    expect(p.rateKgPerWeek).toBe(0);
    expect(p.kcal).toBeCloseTo(p.tdee, 6);
  });

  it('helpers: target weight for a body fat, dates, rate from kcal', () => {
    expect(targetWeightForBodyFat(90, 25, 15)).toBeCloseTo(67.5 / 0.85, 6);
    const now = new Date('2026-11-18T09:00:00Z');
    expect(weeksUntil('2027-02-10', now)).toBe(12);
    expect(dateAfterWeeks(12, now)).toBe('2027-02-10');
    expect(rateFromKcal(2000, 2550, K)).toBeCloseTo((-550 * 7) / 7700, 6);
    expect(rateFromKcal(3000, 2550, K)).toBeCloseTo((450 * 7) / 5500, 6);
  });
});

describe('personalised protein', () => {
  const P = DEFAULT_PROTEIN_COEFFICIENTS;
  it('cut with body fat: g per kg of fat-free mass, leaner → higher', () => {
    const lean = personalMacros({ ...MAN, bodyFatPercent: 10 }, 'cut', 'intermediate', 2200, P, KPG);
    expect(lean.basis).toBe('ffm');
    expect(lean.reason).toBe('cut_ffm');
    expect(lean.perKg).toBe(3.1);
    expect(lean.proteinG).toBeCloseTo(3.1 * 81, 6);
    const softer = personalMacros({ ...MAN, bodyFatPercent: 22 }, 'cut', 'intermediate', 2200, P, KPG);
    expect(softer.perKg).toBeLessThan(lean.perKg);
    expect(softer.perKg).toBeGreaterThanOrEqual(2.3);
  });

  it('bulk by training age; age 50+ adds; fat floor and carbs fill the rest', () => {
    const b = personalMacros(MAN, 'bulk', 'beginner', 3000, P, KPG);
    const a = personalMacros(MAN, 'bulk', 'advanced', 3000, P, KPG);
    expect(b.perKg).toBeLessThan(a.perKg);
    expect(a.perKg).toBe(2.2);
    const old = personalMacros({ ...MAN, ageYears: 55 }, 'bulk', 'advanced', 3000, P, KPG);
    expect(old.perKg).toBe(2.4);
    expect(old.age50).toBe(true);
    expect(a.fatG).toBeGreaterThanOrEqual(Math.max(0.8 * 90, (3000 * 0.2) / 9) - 1e-9);
    expect(4 * a.proteinG + 9 * a.fatG + 4 * a.carbG).toBeCloseTo(3000, 6);
  });

  it('obesity: protein on an adjusted weight', () => {
    const big = { ...MAN, weightKg: 130 };
    const m = personalMacros(big, 'cut', 'beginner', 2200, P, KPG);
    expect(m.basis).toBe('adjusted');
    expect(m.refKg).toBeCloseTo(adjustedWeightKg('male', 178, 130), 6);
    expect(m.refKg).toBeLessThan(130);
  });
});
