import type { MacroTotals } from './totals';

export interface MealLike<Item> {
  id: string;
  name: string;
  time: string | null;
  items: readonly Item[];
}

/** Deep copy of a day's meals with fresh ids (for "duplicate day"). */
export function duplicateMeals<Item extends object, M extends MealLike<Item>>(meals: readonly M[], newId: () => string): M[] {
  return meals.map((m) => ({ ...m, id: newId(), items: m.items.map((i) => ({ ...i })) }));
}

/** Moves a meal from one position to another; out-of-range indices return the input unchanged. */
export function moveMeal<M>(meals: readonly M[], from: number, to: number): M[] {
  if (from < 0 || from >= meals.length || to < 0 || to >= meals.length || from === to) return [...meals];
  const out = [...meals];
  const [moved] = out.splice(from, 1);
  if (moved !== undefined) out.splice(to, 0, moved);
  return out;
}

/** Replaces one item in one meal (the "swap" action). Returns a new array. */
export function replaceItem<Item, M extends MealLike<Item>>(meals: readonly M[], mealId: string, index: number, next: Item): M[] {
  return meals.map((m) => {
    if (m.id !== mealId || index < 0 || index >= m.items.length) return m;
    const items = [...m.items];
    items[index] = next;
    return { ...m, items };
  });
}

export interface SwapCandidate {
  recipeId: string;
  perServing: MacroTotals;
}

/**
 * Recipes ordered by how close their per-serving calories are to `kcal` (closest first),
 * excluding `excludeId`. Ties keep the input order.
 */
export function swapCandidates(all: readonly SwapCandidate[], kcal: number, excludeId: string | null, limit = 8): SwapCandidate[] {
  return all
    .filter((c) => c.recipeId !== excludeId)
    .map((c, i) => ({ c, i, d: Math.abs(c.perServing.kcal - kcal) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Next free "day N" number given existing plan names produced by `dayNumberOf`. */
export function nextDayNumber(existing: readonly (number | null)[]): number {
  const used = existing.filter((n): n is number => n !== null);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}
