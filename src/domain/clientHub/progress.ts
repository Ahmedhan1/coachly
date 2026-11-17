export interface ProgressLike {
  id: string;
  date: string;
  measurements: { weightKg?: number; waistCm?: number };
  photoIds: readonly string[];
}

const delta = (cur: number | undefined, prev: number | undefined) => (cur === undefined || prev === undefined ? null : Math.round((cur - prev) * 10) / 10);

/** Check-ins newest first, each with the change since the previous recorded weight / waist. */
export function progressTimeline<T extends ProgressLike>(entries: readonly T[]) {
  const oldestFirst = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let weight: number | undefined;
  let waist: number | undefined;
  const items = oldestFirst.map((entry) => {
    const m = entry.measurements;
    const item = { entry, weightDeltaKg: delta(m.weightKg, weight), waistDeltaCm: delta(m.waistCm, waist), photos: entry.photoIds.length };
    weight = m.weightKg ?? weight;
    waist = m.waistCm ?? waist;
    return item;
  });
  return items.reverse();
}
