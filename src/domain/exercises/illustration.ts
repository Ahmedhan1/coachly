import type { MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

/** Muscle colouring of an exercise illustration: group → 0..1 (same scale as the 2D/3D muscle map). */
export type IllustrationIntensities = Partial<Record<MuscleGroupId, number>>;
export type IllustrationView = 'front' | 'back';

export interface IllustrationSpec {
  view: IllustrationView;
  intensities: IllustrationIntensities;
  framing: IllustrationFraming;
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
  return { view: back > front ? 'back' : 'front', intensities, framing: illustrationFraming(exercise) };
}

/** Stable cache key: same view, same muscles, same brand colour → same picture. */
export function illustrationKey(spec: IllustrationSpec, brandHex: string): string {
  const muscles = Object.entries(spec.intensities)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, value]) => `${id}=${value}`)
    .join(',');
  const { focus, fill, minHeightShare } = spec.framing;
  return `${spec.view}|${muscles}|${[...focus].sort().join('+')}@${fill}/${minHeightShare}|${brandHex.toLowerCase()}`;
}

/** Body regions used to decide how much context a picture shows around the worked muscle. */
export type FramingRegion = 'legs' | 'arms' | 'torso';

const REGION_OF: Readonly<Record<MuscleGroupId, FramingRegion>> = {
  chest: 'torso', shoulders: 'torso', abs: 'torso', obliques: 'torso', neck: 'torso', traps: 'torso', lats: 'torso',
  middle_back: 'torso', lower_back: 'torso',
  biceps: 'arms', triceps: 'arms', forearms: 'arms',
  glutes: 'legs', hip_flexors: 'legs', quads: 'legs', hamstrings: 'legs', adductors: 'legs', abductors: 'legs',
  calves: 'legs', tibialis: 'legs',
};

export interface IllustrationFraming {
  /** Muscle groups the camera centres on (their meshes' bounding box). */
  focus: MuscleGroupId[];
  /** Share of the picture height the focus region should fill (the rest is body context). */
  fill: number;
  /** The picture never shows less than this share of the body height (so a small muscle keeps its surroundings). */
  minHeightShare: number;
}

/** Minimum visible share of the body height per region: hips→knees, knees→feet, arm+shoulder, torso. */
const MIN_SHARE: Readonly<Record<FramingRegion, number>> = { legs: 0.42, arms: 0.4, torso: 0.5 };
const FILL = 0.65;

/**
 * How the camera is framed: on the primary muscles (arms also take the shoulders for context), filling about
 * 65% of the picture, never closer than a region-sized window of the body. With no primary muscle: the
 * secondary ones.
 */
export function illustrationFraming(exercise: MuscleLists): IllustrationFraming {
  const base = exercise.primaryMuscles.length > 0 ? [...exercise.primaryMuscles] : [...exercise.secondaryMuscles];
  const focus = base.every((m) => REGION_OF[m] === 'arms') && base.length > 0 ? [...base, 'shoulders' as const] : base;
  const regions = new Set(base.map((m) => REGION_OF[m]));
  const share = regions.size === 0 ? 1 : Math.max(...[...regions].map((r) => MIN_SHARE[r]));
  return { focus, fill: FILL, minHeightShare: regions.size === 0 ? 1 : share };
}
