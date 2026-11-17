import { illustrationSpec, type CatalogExercise } from '@/domain/exercises';
import { IllustrationProvider, cacheApiStore, readIllustrationPalette } from './illustrationProvider';

let provider: IllustrationProvider | null = null;

/**
 * URL of the muscle-target picture for an exercise, drawn from our own 3D model (lazy: three.js is only
 * downloaded the first time a picture is needed) and cached. Resolves null when it cannot be drawn.
 * Import this file, not the model3d index, from screens so the 3D library stays out of the main bundle.
 */
export function exerciseIllustrationUrl(exercise: Pick<CatalogExercise, 'primaryMuscles' | 'secondaryMuscles'>): Promise<string | null> {
  provider ??= new IllustrationProvider({
    store: cacheApiStore(),
    render: async (spec, palette) => (await import('./illustrationRenderer')).renderIllustration(spec, palette),
  });
  return provider.url(illustrationSpec(exercise), readIllustrationPalette());
}
