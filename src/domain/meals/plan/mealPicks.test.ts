import { describe, expect, it } from 'vitest';
import { applyMealPicks, effectivePicks, parseMealPicks } from '..';

const plans = [
  {
    id: 'p1',
    name: 'يوم 1',
    meals: [
      { id: 'm1', name: 'فطار', items: ['فول'], options: [{ items: ['بيض'] }, { items: ['شوفان'] }] },
      { id: 'm2', name: 'غدا', items: ['فراخ'], options: [{ items: ['سمك'] }] },
      { id: 'm3', name: 'عشا', items: ['زبادي'] },
    ],
  },
  { id: 'p2', name: 'يوم 2', meals: [{ id: 'm4', name: 'فطار', items: ['عيش'] }] },
];

describe('client meal picks', () => {
  it('parses stored picks and drops bad ones', () => {
    expect(parseMealPicks(null)).toBeNull();
    expect(parseMealPicks({ at: 5, picks: [{ id: 'm1', o: 2 }, { id: 'x', o: 9 }, 'bad'] })).toEqual({ at: 5, picks: [{ id: 'm1', o: 2 }] });
  });

  it('lists only picks that change a meal', () => {
    const e = effectivePicks(plans, [
      { id: 'm1', o: 2 },
      { id: 'm2', o: 0 },
      { id: 'm3', o: 1 },
      { id: 'gone', o: 1 },
    ]);
    expect(e).toEqual([{ planId: 'p1', planName: 'يوم 1', mealName: 'فطار', items: ['شوفان'], o: 2 }]);
  });

  it('applies picks: the option becomes the meal and the old meal stays as an option', () => {
    const changed = applyMealPicks(plans, [
      { id: 'm1', o: 2 },
      { id: 'm2', o: 1 },
    ]);
    expect(changed).toHaveLength(1);
    const meals = changed[0]?.meals ?? [];
    expect(meals[0]?.items).toEqual(['شوفان']);
    expect(meals[0]?.options).toEqual([{ items: ['بيض'] }, { items: ['فول'] }]);
    expect(meals[1]?.items).toEqual(['سمك']);
    expect(meals[2]).toBe(plans[0]?.meals[2]);
  });
});
