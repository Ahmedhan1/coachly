import { MUSCLE_GROUP_IDS, type MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

export interface MuscleWeights {
  primary: number;
  secondary: number;
}

export const DEFAULT_MUSCLE_WEIGHTS: MuscleWeights = { primary: 1, secondary: 0.5 };

/** One program-day item as far as muscle colouring cares. */
export interface MuscleLoadItem {
  exerciseId: string;
  /** Defaults to 1. */
  sets?: number;
}

export interface MuscleLoad {
  muscle: MuscleGroupId;
  /** Σ sets × weight. */
  score: number;
  /** score / highest score, 0..1 — drives the colour on the 2D/3D map. */
  intensity: number;
  /** 'primary' when any exercise targets it as primary. */
  role: 'primary' | 'secondary';
}

const ORDER: ReadonlyMap<MuscleGroupId, number> = new Map(MUSCLE_GROUP_IDS.map((id, i) => [id, i]));
const order = (id: MuscleGroupId): number => ORDER.get(id) ?? 0;
const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Aggregates the muscles targeted by a program day (or any list of exercises with sets). Unknown exercise
 * ids and items with sets ≤ 0 are ignored. Muscles with score 0 are left out. Sorted by score, then id order.
 */
export function muscleLoad(
  items: readonly MuscleLoadItem[],
  catalogById: ReadonlyMap<string, CatalogExercise>,
  weights: MuscleWeights = DEFAULT_MUSCLE_WEIGHTS,
): MuscleLoad[] {
  const scores = new Map<MuscleGroupId, { score: number; primary: boolean }>();
  const add = (muscle: MuscleGroupId, amount: number, primary: boolean) => {
    if (amount <= 0) return;
    const current = scores.get(muscle) ?? { score: 0, primary: false };
    scores.set(muscle, { score: current.score + amount, primary: current.primary || primary });
  };
  for (const item of items) {
    const exercise = catalogById.get(item.exerciseId);
    const sets = item.sets ?? 1;
    if (exercise === undefined || !Number.isFinite(sets) || sets <= 0) continue;
    for (const m of exercise.primaryMuscles) add(m, sets * weights.primary, true);
    for (const m of exercise.secondaryMuscles) {
      if (!exercise.primaryMuscles.includes(m)) add(m, sets * weights.secondary, false);
    }
  }
  const max = Math.max(0, ...[...scores.values()].map((s) => s.score));
  return [...scores.entries()]
    .map(([muscle, s]): MuscleLoad => ({
      muscle,
      score: round(s.score),
      intensity: max > 0 ? round(s.score / max) : 0,
      role: s.primary ? 'primary' : 'secondary',
    }))
    .sort((a, b) => b.score - a.score || order(a.muscle) - order(b.muscle));
}

/** Muscle colouring for a single exercise. */
export function muscleLoadForExercise(exercise: CatalogExercise, weights: MuscleWeights = DEFAULT_MUSCLE_WEIGHTS): MuscleLoad[] {
  return muscleLoad([{ exerciseId: exercise.id, sets: 1 }], new Map([[exercise.id, exercise]]), weights);
}

/** Buckets an intensity (0..1) into 0..steps for a stepped colour scale; 0 means "not targeted". */
export function intensityStep(intensity: number, steps: number): number {
  if (!(intensity > 0)) return 0;
  return Math.min(steps, Math.ceil(intensity * steps));
}
