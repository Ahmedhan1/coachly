import type { GramDay, GramLine } from './gramPlanner';

/** Grams of fibre in a planned day (foods without a fibre value count as 0). */
export function dayFiber(day: Pick<GramDay, 'meals'>): number {
  let g = 0;
  for (const m of day.meals) for (const d of m.dishes) for (const l of d.lines) g += ((l.src.fiberPer100g ?? 0) * l.grams) / 100;
  return Math.round(g);
}

/** Fibre to aim for: 14 g per 1000 kcal (a common dietary reference). */
export const FIBER_G_PER_1000_KCAL = 14;
export const fiberTarget = (kcal: number) => Math.round((Math.max(0, kcal) / 1000) * FIBER_G_PER_1000_KCAL);

/** Share of a target reached, 0–1.5 (for bars; over 100 % shows as a little overflow). */
export function fillRatio(value: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1.5, value / target));
}

export interface WeekShoppingLine {
  name: string;
  nameEn?: string;
  foodId?: string;
  grams: number;
  /** Total count for eggs and loaves, else null. */
  units: number | null;
  unitLabel?: string;
  unitLabelEn?: string;
}

/**
 * Everything to buy for the planned days: the shown grams of each food added up (counted foods also add up
 * their units). Sorted by grams, biggest first, so the main shopping is at the top.
 */
export function weekShopping(days: readonly Pick<GramDay, 'meals'>[]): WeekShoppingLine[] {
  const byKey = new Map<string, WeekShoppingLine>();
  const add = (l: GramLine) => {
    const key = l.src.foodId ?? l.src.name;
    const prev = byKey.get(key);
    const units = l.units !== null ? (prev?.units ?? 0) + l.units : (prev?.units ?? null);
    byKey.set(key, {
      name: l.src.name,
      ...(l.src.nameEn ? { nameEn: l.src.nameEn } : {}),
      ...(l.src.foodId ? { foodId: l.src.foodId } : {}),
      grams: (prev?.grams ?? 0) + l.grams,
      units,
      ...(l.src.unitLabel ? { unitLabel: l.src.unitLabel } : {}),
      ...(l.src.unitLabelEn ? { unitLabelEn: l.src.unitLabelEn } : {}),
    });
  };
  for (const d of days) for (const m of d.meals) for (const dish of m.dishes) for (const l of dish.lines) add(l);
  return [...byKey.values()].map((l) => ({ ...l, grams: l.grams >= 1000 ? Math.round(l.grams / 50) * 50 : l.grams >= 100 ? Math.round(l.grams / 10) * 10 : Math.round(l.grams) })).sort((a, b) => b.grams - a.grams || a.name.localeCompare(b.name));
}
