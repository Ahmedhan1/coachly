import { intensityStep } from './muscleLoad';
import type { MuscleGroupId } from './pack';

/** Intensity 0..1 per muscle group; missing = not targeted. Shared by the 2D map and the 3D model. */
export type MuscleIntensities = Partial<Record<MuscleGroupId, number>>;

/** Concrete colours (hex) for contexts without CSS variables: the WebGL model, PDF snapshots. */
export interface MuscleMapPalette {
  base: string;
  off: string;
  hit: string;
}

/** Light → strong brand scale: share of the brand colour mixed into the "off" colour for steps 1..4. */
export const INTENSITY_STEPS = [0.4, 0.6, 0.8, 1] as const;

/** Step 0..4 for an intensity (0 = not targeted). */
export const fillStep = (intensity: number | undefined): number => intensityStep(intensity ?? 0, INTENSITY_STEPS.length);

/** Share of the brand colour for an intensity (0 = not targeted). */
export const fillShare = (intensity: number | undefined): number => {
  const step = fillStep(intensity);
  return step === 0 ? 0 : (INTENSITY_STEPS[step - 1] ?? 1);
};

const hex = (value: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  const n = m?.[1] ? Number.parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: readonly number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** sRGB mix of `a` into `b`: share 1 = a. */
export function mixHex(a: string, b: string, share: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  return toHex([br + (ar - br) * share, bg + (ag - bg) * share, bb + (ab - bb) * share]);
}

/** Hex colour for an intensity with a concrete palette. */
export function paletteFill(intensity: number | undefined, palette: MuscleMapPalette): string {
  const share = fillShare(intensity);
  return share === 0 ? palette.off : mixHex(palette.hit, palette.off, share);
}
