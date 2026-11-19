import { describe, expect, it } from 'vitest';
import { cycleDayTypes, cycleTargets, type MacroTargets } from '..';

const KPG = { protein: 4, carb: 4, fat: 9 };
const BASE: MacroTargets = { kcal: 2200, proteinG: 170, carbG: 220, fatG: 70 };

describe('carb cycling', () => {
  it('maps training weekdays and a refeed day to day types', () => {
    expect(cycleDayTypes(7, [0, 2, 4], 6)).toEqual(['training', 'rest', 'training', 'rest', 'training', 'rest', 'refeed']);
    expect(cycleDayTypes(3, [], null)).toEqual(['rest', 'rest', 'rest']);
  });

  it('training days get more carbs, the weekly average stays on the base calories', () => {
    const types = cycleDayTypes(7, [0, 2, 4], null);
    const r = cycleTargets(BASE, types, { trainingExtraKcal: 300, refeedKcal: 2600 }, KPG);
    expect(r.days).toHaveLength(7);
    const train = r.days[0];
    const rest = r.days[1];
    expect((train?.kcal ?? 0) - (rest?.kcal ?? 0)).toBeGreaterThanOrEqual(299);
    expect(train?.carbG ?? 0).toBeGreaterThan(rest?.carbG ?? 0);
    expect(train?.proteinG).toBe(BASE.proteinG);
    expect(rest?.fatG).toBe(BASE.fatG);
    expect(Math.abs(r.averageKcal - BASE.kcal)).toBeLessThanOrEqual(1);
  });

  it('a refeed day eats maintenance; the other days give way to keep the average', () => {
    const types = cycleDayTypes(7, [0, 2, 4], 5);
    const r = cycleTargets(BASE, types, { trainingExtraKcal: 300, refeedKcal: 2700 }, KPG);
    expect(r.days[5]?.kcal).toBe(2700);
    expect(Math.abs(r.averageKcal - BASE.kcal)).toBeLessThanOrEqual(1);
    expect(r.days[1]?.kcal ?? 0).toBeLessThan(BASE.kcal);
  });

  it('carbs never go negative; fat gives way when a rest day gets too low', () => {
    const lean: MacroTargets = { kcal: 1500, proteinG: 180, carbG: 60, fatG: 60 };
    const r = cycleTargets(lean, cycleDayTypes(7, [0, 1, 2, 3, 4, 5], null), { trainingExtraKcal: 800, refeedKcal: 0 }, KPG);
    for (const d of r.days) {
      expect(d.carbG).toBeGreaterThanOrEqual(0);
      expect(d.fatG).toBeGreaterThanOrEqual(0);
    }
  });

  it('all rest days = the base every day', () => {
    const r = cycleTargets(BASE, cycleDayTypes(7, [], null), { trainingExtraKcal: 300, refeedKcal: 2600 }, KPG);
    for (const d of r.days) expect(d.kcal).toBe(BASE.kcal);
  });
});
