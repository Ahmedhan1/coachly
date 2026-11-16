import type { MuscleLoad } from '@/domain/exercises';
import { fillShare, paletteFill, type MuscleIntensities, type MuscleMapPalette } from '@/services/model3d/palette';

export { fillStep, INTENSITY_STEPS, mixHex, type MuscleIntensities, type MuscleMapPalette } from '@/services/model3d/palette';

export function intensitiesFromLoad(loads: readonly MuscleLoad[]): MuscleIntensities {
  const out: MuscleIntensities = {};
  for (const l of loads) out[l.muscle] = l.intensity;
  return out;
}

/** CSS fill for an intensity: theme variables by default, concrete hex with a palette. */
export function muscleFill(intensity: number | undefined, palette?: MuscleMapPalette): string {
  if (palette) return paletteFill(intensity, palette);
  const share = fillShare(intensity);
  if (share === 0) return 'var(--muscle-off)';
  if (share === 1) return 'var(--muscle-hit)';
  return `color-mix(in oklab, var(--muscle-hit) ${Math.round(share * 100)}%, var(--muscle-off))`;
}
