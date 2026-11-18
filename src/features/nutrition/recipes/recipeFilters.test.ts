import { describe, expect, it } from 'vitest';
import { NO_FILTER, isFiltered, matchesFilter, toggleFlag } from './recipeFilters';

const macros = (kcal: number, proteinG: number) => ({ kcal, proteinG, carbG: 0, fatG: 0 });
const foul = { tags: ['فطار', 'نباتي', 'نباتي صرف'], prepMin: 5, cuisine: 'egyptian' as const };
const kabsa = { tags: ['غدا', 'تضخيم'], prepMin: 50, cuisine: 'gulf' as const };
const mine = { tags: ['عشا', 'سريع'] };

describe('recipe browse filters', () => {
  it('no filter matches everything', () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    for (const r of [foul, kabsa, mine]) expect(matchesFilter(r, macros(400, 10), NO_FILTER)).toBe(true);
  });

  it('slot, cuisine and flags all have to match', () => {
    expect(matchesFilter(foul, macros(300, 15), { ...NO_FILTER, slot: 'breakfast' })).toBe(true);
    expect(matchesFilter(kabsa, macros(600, 40), { ...NO_FILTER, slot: 'breakfast' })).toBe(false);
    expect(matchesFilter(kabsa, macros(600, 40), { slot: 'lunch', cuisine: 'gulf', flags: ['bulk'] })).toBe(true);
    expect(matchesFilter(kabsa, macros(600, 40), { slot: 'lunch', cuisine: 'egyptian', flags: [] })).toBe(false);
  });

  it('quick uses the prep time, or the quick tag when there is no time', () => {
    const f = toggleFlag(NO_FILTER, 'quick');
    expect(matchesFilter(foul, macros(300, 10), f)).toBe(true);
    expect(matchesFilter(kabsa, macros(300, 10), f)).toBe(false);
    expect(matchesFilter(mine, macros(300, 10), f)).toBe(true);
  });

  it('high protein = tagged or 30 %+ of calories from protein; vegan counts as vegetarian', () => {
    const hp = toggleFlag(NO_FILTER, 'highProtein');
    expect(matchesFilter(kabsa, macros(600, 45), hp)).toBe(true);
    expect(matchesFilter(kabsa, macros(600, 44), hp)).toBe(false);
    expect(matchesFilter({ ...foul, tags: ['نباتي صرف'] }, macros(1, 0), toggleFlag(NO_FILTER, 'vegetarian'))).toBe(true);
    expect(toggleFlag(hp, 'highProtein').flags).toEqual([]);
  });
});
