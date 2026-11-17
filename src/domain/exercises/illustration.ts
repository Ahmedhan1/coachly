import type { MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

/** Muscle colouring of an exercise illustration: group → 0..1 (same scale as the 2D/3D muscle map). */
export type IllustrationIntensities = Partial<Record<MuscleGroupId, number>>;
export type IllustrationView = 'front' | 'back';

export interface IllustrationSpec {
  view: IllustrationView;
  intensities: IllustrationIntensities;
}

/** Primary muscles get the full brand colour (step 4), secondary ones the lightest tint (step 1). */
export const PRIMARY_INTENSITY = 1;
export const SECONDARY_INTENSITY = 0.25;

/** Muscles that are mostly seen from the front / from the back. Shoulders, forearms and neck show on both. */
const FRONT_SIDE: ReadonlySet<MuscleGroupId> = new Set(['chest', 'abs', 'obliques', 'biceps', 'quads', 'hip_flexors', 'adductors', 'tibialis']);
const BACK_SIDE: ReadonlySet<MuscleGroupId> = new Set(['lats', 'middle_back', 'lower_back', 'glutes', 'hamstrings', 'triceps', 'calves', 'traps', 'abductors']);

const PRIMARY_WEIGHT = 3;
const SECONDARY_WEIGHT = 1;

type MuscleLists = Pick<CatalogExercise, 'primaryMuscles' | 'secondaryMuscles'>;

/**
 * What to draw for an exercise: primary muscles in the strong colour, secondary ones lighter, and the view
 * (front or back) where most of the worked muscle is visible. Ties go to the front.
 */
export function illustrationSpec(exercise: MuscleLists): IllustrationSpec {
  const intensities: IllustrationIntensities = {};
  let front = 0;
  let back = 0;
  const add = (muscle: MuscleGroupId, intensity: number, weight: number) => {
    if (intensities[muscle] !== undefined) return;
    intensities[muscle] = intensity;
    if (FRONT_SIDE.has(muscle)) front += weight;
    else if (BACK_SIDE.has(muscle)) back += weight;
  };
  for (const m of exercise.primaryMuscles) add(m, PRIMARY_INTENSITY, PRIMARY_WEIGHT);
  for (const m of exercise.secondaryMuscles) add(m, SECONDARY_INTENSITY, SECONDARY_WEIGHT);
  return { view: back > front ? 'back' : 'front', intensities };
}

/** Stable cache key: same view, same muscles, same brand colour → same picture. */
export function illustrationKey(spec: IllustrationSpec, brandHex: string): string {
  const muscles = Object.entries(spec.intensities)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, value]) => `${id}=${value}`)
    .join(',');
  return `${spec.view}|${muscles}|${brandHex.toLowerCase()}`;
}
