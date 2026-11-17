import type { CatalogExercise } from './types';

/**
 * Exercises that can replace `target` (machine taken, injury, no equipment): same main muscle first, then
 * same movement (force/mechanic), same equipment, similar level and overlapping secondary muscles.
 * `available` (optional) limits to the equipment the trainer has.
 */
export function alternativesFor(
  target: CatalogExercise,
  catalog: readonly CatalogExercise[],
  opts: { limit?: number; available?: ReadonlySet<string> } = {},
): CatalogExercise[] {
  const main = target.primaryMuscles[0];
  if (!main) return [];
  const levelRank = { beginner: 0, intermediate: 1, expert: 2 } as Record<string, number>;
  const scored = catalog
    .filter((e) => e.id !== target.id && e.primaryMuscles.includes(main))
    .filter((e) => !opts.available || e.equipment === 'body_only' || opts.available.has(e.equipment))
    .map((e) => {
      let score = e.primaryMuscles[0] === main ? 10 : 5;
      if (e.force && e.force === target.force) score += 3;
      if (e.mechanic && e.mechanic === target.mechanic) score += 3;
      if (e.equipment === target.equipment) score += 2;
      if (e.category === target.category) score += 1;
      score -= Math.abs((levelRank[e.level] ?? 1) - (levelRank[target.level] ?? 1));
      score += e.secondaryMuscles.filter((m) => target.secondaryMuscles.includes(m)).length * 0.5;
      if (e.images.length > 0) score += 0.25;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || a.e.nameAr.localeCompare(b.e.nameAr, 'ar'));
  return scored.slice(0, opts.limit ?? 6).map((s) => s.e);
}
