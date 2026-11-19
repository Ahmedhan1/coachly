import { describe, expect, it } from 'vitest';
import {
  DIET_SCHEDULES,
  checkMacros,
  defaultDietSettings,
  dietNoteKeys,
  goalTargets,
  parseDietSettings,
  planDay,
  planWeek,
  recipeKinds,
  slotAlternatives,
  slotsFor,
  styleTargets,
  withKcal,
  macroSplit,
  type DietRecipe,
} from '..';

const DS = defaultDietSettings();
const KPG = { protein: 4, carb: 4, fat: 9 };

const r = (id: string, tags: string[], kcal: number, proteinG: number, carbG: number, fatG: number): DietRecipe => ({
  id,
  tags,
  perServing: { kcal, proteinG, carbG, fatG },
});

/** A small but varied book: several options per meal plus protein and carb sides. */
const BOOK: DietRecipe[] = [
  r('foul', ['فطار'], 330, 17, 45, 9),
  r('oats', ['فطار', 'تضخيم'], 420, 18, 65, 10),
  r('omelette', ['فطار', 'عشا', 'تنشيف'], 260, 20, 6, 17),
  r('areesh', ['فطار', 'عشا', 'تنشيف'], 180, 22, 8, 6),
  r('chicken_rice', ['غدا'], 560, 45, 60, 14),
  r('kofta_rice', ['غدا', 'تضخيم'], 650, 38, 62, 26),
  r('fish_salad', ['غدا', 'تنشيف'], 380, 42, 20, 13),
  r('pasta_chicken', ['غدا'], 600, 40, 75, 14),
  r('tuna_salad', ['عشا', 'تنشيف'], 280, 32, 12, 11),
  r('lentil_soup', ['عشا'], 300, 16, 45, 6),
  r('chicken_veg', ['عشا', 'غدا'], 350, 40, 15, 13),
  r('yogurt_fruit', ['سناك', 'فطار'], 220, 12, 32, 5),
  r('greek_yogurt', ['سناك', 'بروتين عالي'], 130, 17, 6, 4),
  r('boiled_eggs', ['سناك', 'فطار'], 155, 13, 1, 11),
  r('dates', ['سناك'], 140, 1, 37, 0),
  r('bread', ['فطار', 'غدا', 'عشا', 'جانبي'], 250, 9, 50, 1.5),
  r('rice', ['غدا', 'جانبي'], 200, 4, 44, 0.5),
];

const CUT = { kcal: 2000, proteinG: 160, carbG: 196, fatG: 64 };
const BULK = { kcal: 3000, proteinG: 150, carbG: 400, fatG: 85 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('diet targets', () => {
  it('goalTargets applies the goal percent, then protein and fat per kg, carbs fill the rest', () => {
    const t = goalTargets({ tdee: 2500, weightKg: 80, proteinPerKg: 2, fatPerKg: 0.8 }, 'cut', 20, KPG);
    expect(t).toEqual({ kcal: 2000, proteinG: 160, fatG: 64, carbG: 196 });
    expect(goalTargets({ tdee: 2500, weightKg: 80, proteinPerKg: 2, fatPerKg: 0.8 }, 'maintain', 20, KPG).kcal).toBe(2500);
    expect(goalTargets({ tdee: 2500, weightKg: 80, proteinPerKg: 2, fatPerKg: 0.8 }, 'bulk', 10, KPG).kcal).toBe(2750);
  });

  it('carbs never go negative', () => {
    const t = goalTargets({ tdee: 1000, weightKg: 120, proteinPerKg: 2.2, fatPerKg: 1 }, 'cut', 25, KPG);
    expect(t.carbG).toBe(0);
  });

  it('high protein raises protein to the setting and keeps calories; low carb caps carbs and fat fills', () => {
    const hp = styleTargets(CUT, 'high_protein', 80, DS, KPG);
    expect(hp.proteinG).toBeCloseTo(80 * DS.highProteinPerKg);
    expect(hp.kcal).toBe(2000);
    expect(hp.proteinG * 4 + hp.carbG * 4 + hp.fatG * 9).toBeCloseTo(2000);
    const lc = styleTargets(CUT, 'low_carb', 80, DS, KPG);
    expect(lc.carbG).toBeCloseTo((2000 * DS.lowCarbPercent) / 100 / 4);
    expect(lc.proteinG * 4 + lc.carbG * 4 + lc.fatG * 9).toBeCloseTo(2000);
    expect(styleTargets(CUT, 'balanced', 80, DS, KPG)).toEqual(CUT);
  });
});

describe('meal layouts', () => {
  it('every schedule and meal count has shares that add up to 100 and valid times', () => {
    for (const schedule of DIET_SCHEDULES) {
      for (const n of [3, 4, 5] as const) {
        const slots = slotsFor(schedule, n, DS);
        expect(slots).toHaveLength(n);
        expect(sum(slots.map((s) => s.sharePercent))).toBe(100);
        for (const s of slots) expect(s.time).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  it('ramadan has iftar and suhoor; intermittent fasting stays inside an 8-hour window', () => {
    const ram = slotsFor('ramadan', 3, DS).map((s) => s.label);
    expect(ram).toContain('iftar');
    expect(ram).toContain('suhoor');
    const times = slotsFor('if_16_8', 4, DS).map((s) => Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)));
    expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(8 * 60);
  });

  it('broken stored settings fall back to the defaults', () => {
    expect(parseDietSettings('x')).toEqual(DS);
    expect(parseDietSettings({ highProteinPerKg: 'a' })).toEqual(DS);
    expect(parseDietSettings({ highProteinPerKg: 2.4 }).highProteinPerKg).toBe(2.4);
  });
});

describe('recipe kinds', () => {
  it('reads meal tags, falling back to macros for untagged recipes', () => {
    expect(recipeKinds(r('a', ['فطار', 'سناك'], 100, 5, 10, 2))).toEqual(['breakfast', 'snack']);
    expect(recipeKinds(r('b', [], 120, 5, 10, 2))).toEqual(['snack']);
    expect(recipeKinds(r('c', [], 500, 30, 50, 15))).toEqual(['lunch', 'dinner']);
  });
});

describe('planDay', () => {
  const slots = slotsFor('normal', 4, DS);

  it('hits calories and protein within tolerance using the book', () => {
    const day = planDay(BOOK, CUT, { goal: 'cut', slots, dayIndex: 0, recent: new Set() }, DS);
    expect(day.meals).toHaveLength(4);
    expect(day.meals.every((m) => m.items.length > 0)).toBe(true);
    expect(Math.abs(day.totals.kcal - CUT.kcal) / CUT.kcal).toBeLessThanOrEqual(DS.kcalTolerancePercent / 100);
    expect(day.check.kcal).toBe('on');
    expect(day.check.protein).not.toBe('under');
    for (const m of day.meals) for (const i of m.items) {
      expect(i.servings).toBeGreaterThanOrEqual(DS.minServings);
      expect(i.servings).toBeLessThanOrEqual(DS.maxServings);
      expect((i.servings / DS.servingStep) % 1).toBeCloseTo(0);
    }
  });

  it('works for a bulk day with five meals', () => {
    const day = planDay(BOOK, BULK, { goal: 'bulk', slots: slotsFor('normal', 5, DS), dayIndex: 2, recent: new Set() }, DS);
    expect(day.check.kcal).toBe('on');
  });

  it('is deterministic and uses breakfast recipes for breakfast', () => {
    const a = planDay(BOOK, CUT, { goal: 'cut', slots, dayIndex: 1, recent: new Set() }, DS);
    const b = planDay(BOOK, CUT, { goal: 'cut', slots, dayIndex: 1, recent: new Set() }, DS);
    expect(a).toEqual(b);
    const breakfast = a.meals[0];
    const main = BOOK.find((x) => x.id === breakfast?.items[0]?.recipeId);
    expect(main?.tags).toContain('فطار');
  });

  it('never uses excluded recipes', () => {
    const day = planDay(BOOK, CUT, { goal: 'cut', slots, dayIndex: 0, recent: new Set(), exclude: new Set(['foul', 'chicken_rice', 'omelette']) }, DS);
    const used = day.meals.flatMap((m) => m.items.map((i) => i.recipeId));
    expect(used).not.toContain('foul');
    expect(used).not.toContain('chicken_rice');
    expect(used).not.toContain('omelette');
  });

  it('returns empty meals and a failed check when the book is empty', () => {
    const day = planDay([], CUT, { goal: 'cut', slots, dayIndex: 0, recent: new Set() }, DS);
    expect(day.meals.every((m) => m.items.length === 0)).toBe(true);
    expect(day.check.ok).toBe(false);
  });
});

describe('planWeek', () => {
  it('makes the requested days and varies the main dishes from one day to the next', () => {
    const week = planWeek(BOOK, CUT, { goal: 'cut', schedule: 'normal', mealsPerDay: 3, days: 7 }, DS);
    expect(week).toHaveLength(7);
    for (let d = 1; d < week.length; d++) {
      const lunchToday = week[d]?.meals[1]?.items[0]?.recipeId;
      const lunchYesterday = week[d - 1]?.meals[1]?.items[0]?.recipeId;
      expect(lunchToday).not.toBe(lunchYesterday);
    }
    expect(week.every((d) => d.check.kcal === 'on')).toBe(true);
  });
});

describe('swaps and checks', () => {
  it('alternatives for a meal are scaled to the meal target and exclude the current dish', () => {
    const target = { kcal: 600, proteinG: 45, carbG: 60, fatG: 18 };
    const alts = slotAlternatives(BOOK, target, 'lunch', 'cut', DS, 'chicken_rice', 4);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(4);
    expect(alts.map((a) => a.recipeId)).not.toContain('chicken_rice');
    for (const a of alts) {
      const rec = BOOK.find((x) => x.id === a.recipeId);
      expect(Math.abs((rec?.perServing.kcal ?? 0) * a.servings - 600)).toBeLessThan(250);
    }
  });

  it('checkMacros flags each macro against the target', () => {
    const c = checkMacros({ kcal: 2000, proteinG: 120, carbG: 196, fatG: 64 }, CUT, DS);
    expect(c.kcal).toBe('on');
    expect(c.protein).toBe('under');
    expect(c.ok).toBe(false);
    expect(checkMacros(CUT, CUT, DS).ok).toBe(true);
  });

  it('gives practical note keys for each system, never supplement doses', () => {
    expect(dietNoteKeys('cut', 'balanced', 'normal').length).toBeGreaterThan(1);
    expect(dietNoteKeys('bulk', 'high_protein', 'ramadan')).toContain('ramadan');
    expect(dietNoteKeys('maintain', 'low_carb', 'if_16_8')).toContain('if');
    expect(dietNoteKeys('cut', 'balanced', 'normal').join(' ')).not.toMatch(/dose|supplement/);
  });
});

describe('withKcal and macroSplit', () => {
  it('typed calories move carbs only', () => {
    const t = withKcal({ kcal: 2000, proteinG: 150, carbG: 200, fatG: 66.7 }, 2400, KPG);
    expect(t.kcal).toBe(2400);
    expect(t.proteinG).toBe(150);
    expect(t.fatG).toBe(66.7);
    expect(t.carbG).toBeCloseTo(300, 0);
  });

  it('fat gives way when the calories cannot hold protein and fat', () => {
    const t = withKcal({ kcal: 2000, proteinG: 200, carbG: 100, fatG: 80 }, 1000, KPG);
    expect(t.carbG).toBe(0);
    expect(t.proteinG * 4 + t.fatG * 9).toBeCloseTo(1000, 5);
  });

  it('splits calories into whole percents that sum to 100', () => {
    const s = macroSplit({ kcal: 2000, proteinG: 150, carbG: 200, fatG: 66.7 }, KPG);
    expect(s.p + s.c + s.f).toBe(100);
    expect(s).toEqual({ p: 30, c: 40, f: 30 });
    expect(macroSplit({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 }, KPG)).toEqual({ p: 0, c: 0, f: 0 });
  });
});
