/** The client's picks among a meal's options, sent with his check-in: meal id → option index (0 = as planned). */
export interface MealPick {
  id: string;
  o: number;
}

export interface StoredMealPicks {
  /** Check-in time, unix seconds. */
  at: number;
  picks: MealPick[];
}

export const mealPicksKey = (clientId: string) => `nutrition.mealPicks.${clientId}`;

export function parseMealPicks(raw: unknown): StoredMealPicks | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { at?: unknown; picks?: unknown };
  if (typeof r.at !== 'number' || !Array.isArray(r.picks)) return null;
  const picks = r.picks.filter(
    (p): p is MealPick => typeof p === 'object' && p !== null && typeof (p as MealPick).id === 'string' && Number.isInteger((p as MealPick).o) && (p as MealPick).o >= 0 && (p as MealPick).o <= 3,
  );
  return { at: r.at, picks };
}

interface PickMeal<I> {
  id: string;
  name: string;
  items: I[];
  options?: { items: I[] }[];
}
interface PickPlan<I> {
  id: string;
  name: string;
  meals: PickMeal<I>[];
}

/** The picks that change something (option ≥ 1 that exists), with where they land. */
export function effectivePicks<I>(plans: readonly PickPlan<I>[], picks: readonly MealPick[]): { planId: string; planName: string; mealName: string; items: I[]; o: number }[] {
  const byId = new Map(picks.map((p) => [p.id, p.o]));
  const out: { planId: string; planName: string; mealName: string; items: I[]; o: number }[] = [];
  for (const p of plans)
    for (const m of p.meals) {
      const o = byId.get(m.id);
      const opt = o !== undefined && o > 0 ? m.options?.[o - 1] : undefined;
      if (opt && o !== undefined) out.push({ planId: p.id, planName: p.name, mealName: m.name, items: opt.items, o });
    }
  return out;
}

/**
 * Applies the picks to the saved plans: the picked option becomes the meal and the old meal takes its place in
 * the options (so the client page still offers it). Returns only the plans that changed.
 */
export function applyMealPicks<M extends PickMeal<unknown>>(plans: readonly { id: string; meals: readonly M[] }[], picks: readonly MealPick[]): { id: string; meals: M[] }[] {
  const byId = new Map(picks.map((p) => [p.id, p.o]));
  const out: { id: string; meals: M[] }[] = [];
  for (const p of plans) {
    let changed = false;
    const meals = p.meals.map((m): M => {
      const o = byId.get(m.id);
      const opts = m.options ?? [];
      const opt = o !== undefined && o > 0 ? opts[o - 1] : undefined;
      if (!opt || o === undefined) return m;
      changed = true;
      return { ...m, items: opt.items, options: opts.map((x, i) => (i === o - 1 ? { items: m.items } : x)) } as M;
    });
    if (changed) out.push({ id: p.id, meals });
  }
  return out;
}
