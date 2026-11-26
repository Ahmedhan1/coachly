import type { MuscleGroupId } from '@/domain/exercises';

/**
 * Front and back body for a 100×230 viewBox, adapted from the design-phase mockup map.
 * Each list holds paths for the LEFT half of the figure (x ≤ 50); the component mirrors them for the right
 * half, so one region = both sides of one muscle group. Drawing order = list order (later on top).
 */
export type BodyView = 'front' | 'back';

export const VIEWBOX = { width: 100, height: 230 } as const;

/** Neutral silhouette under the muscles (head, neck, hands, knees, feet, torso gaps). */
export const BASE_PATHS: readonly string[] = [
  'M50 4.5c-4.7 0-8.5 4.7-8.5 10.5S45.3 25.5 50 25.5z',
  'M45 31 37 35c-8.4.2-12.6 5.4-13.3 16-1.5 9.6-1.1 19.3-.5 28.4-2.8 9.6-4 19.2-3.7 28.6h5.2c2.5-9.4 4.8-18.6 6.3-27.8l1.9 12.2c-3 18-3 41 .1 58.6-1.6 15.6-1 31.6 1.6 46h8.6c1.4-15 1.8-31 .8-46.6 2-14 4.4-30 6-44.4H50V31z',
  'M46 24.5h4V31h-5z',
  'M20 107c-1.8 0-3.2 2.7-3.2 6s1.4 6 3.2 6 3.2-2.7 3.2-6-1.4-6-3.2-6z',
  'M34 202h8l1 9H31z',
];

export const FRONT_PATHS: ReadonlyArray<readonly [MuscleGroupId, readonly string[]]> = [
  ['neck', ['M45.4 25.2 49 30.6 48 32.2 44.8 28.2z']],
  ['traps', ['M45.5 31 37.5 35.6h8.6z']],
  ['shoulders', ['M37 35.6c-8-.6-12.5 4.4-13 15.4l6.5 2.5c.5-7.5 3.5-12 10-14.5z']],
  ['chest', ['M49.2 38 41.5 38.6C35 41 31.8 47 32.3 55c5.7 4.5 12.7 5 16.9 3z']],
  ['biceps', ['M24 54c-1.6 7-1.7 15 .2 22h6c1.3-7 1.4-14 .4-20z']],
  ['forearms', ['M23.6 79c-2.8 9-4.2 19-4 27l5 .5c2.2-8.5 4.6-18.5 5.8-27.5z']],
  ['abs', ['M43.6 61h5.6v7h-5.6z', 'M43.6 70h5.6v7h-5.6z', 'M43.6 79h5.6v7h-5.6z', 'M43.6 88h5.6v13c-2.7-2-4.6-6-5.6-10z']],
  ['obliques', ['M41.6 61c-5 2.5-6.4 11-6 23l6 7z']],
  ['abductors', ['M34.6 91.5c-1.9 3.2-2.5 6.8-1.8 10.8l3.3-1.8c.1-3 .7-5.7 1.8-7.8z']],
  ['hip_flexors', ['M41.6 95.8 48.6 104.4 47.8 109.6 42.4 101.2c-1.6-1.2-1.9-3.6-.8-5.4z']],
  ['quads', ['M36 101c-5.2 14-5.8 31-2.6 49l9.2 1c2.6-13 3.8-27 4.2-41l-5.3-9.5z']],
  ['adductors', ['M47.8 110l1.5-3v25c-1.7-1-2.5-6-1.5-22z']],
  ['tibialis', ['M34.4 161c-1.8 9.4-1.8 19.4-.2 29.4l2.8.8c.6-10.2.6-20.2-.4-30.6z']],
  ['calves', ['M38.6 160.4c-.6 10.4-.2 21.6 1.2 31.6h1.6c1.2-10.4 1.4-21.6.4-31.8z']],
];

export const BACK_PATHS: ReadonlyArray<readonly [MuscleGroupId, readonly string[]]> = [
  ['neck', ['M45.6 24.4 50 23.2V30l-4.5-.8z']],
  ['traps', ['M50 30l-4.5-.6-8 6.2 6.4 4.6L50 46z']],
  ['shoulders', ['M37 35.6c-8-.6-12.5 4.4-13 15.4l6.5 2.5c.5-7.5 3.5-12 10-14.5z']],
  ['lats', ['M42.2 44.5c-5.7 3.5-8.8 13.5-6.8 27.5l8.1 10 5.7-10V60z']],
  ['middle_back', ['M43.8 40.6 50 46.6V61l-5.4 3.6c-1.6-7.6-2-16.4-.8-24z']],
  ['triceps', ['M24 54c-1.6 7-1.7 15 .2 22h6c1.3-7 1.4-14 .4-20z']],
  ['forearms', ['M23.6 79c-2.8 9-4.2 19-4 27l5 .5c2.2-8.5 4.6-18.5 5.8-27.5z']],
  ['lower_back', ['M44.2 83.5l5-8.5v23l-7.4-2c-.2-5 .8-9 2.4-12.5z']],
  ['obliques', ['M35.6 74l7 9c-1.6 5-2.1 9-2 13l-4.6-2c-1-6-1-14-.4-20z']],
  ['abductors', ['M36 95.5l4.6 1.8c-.8 2.6-2.4 4.8-4.8 6.2-.6-2.6-.6-5.2.2-8z']],
  ['glutes', ['M41.2 98l8.1 1.5V119c-6.3 2-12.7-1-13.9-9-.2-3 .4-5 1.4-6 2.2-1 3.8-3 4.4-6z']],
  ['hamstrings', ['M35 122c-2.4 12-1.8 24 1 31h11c1.2-12 1.4-22 1-30.5-4 1.5-9 1.5-13-.5z']],
  ['calves', ['M33 159c-2.6 10-2 22 1.8 32h6.4c2.2-10 2.2-22 .4-32z']],
];

export const VIEW_PATHS: Readonly<Record<BodyView, typeof FRONT_PATHS>> = { front: FRONT_PATHS, back: BACK_PATHS };
