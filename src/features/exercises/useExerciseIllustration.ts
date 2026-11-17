import { useEffect, useState } from 'react';
import type { CatalogExercise } from '@/domain/exercises';
import { exerciseIllustrationUrl } from '@/services/model3d/exerciseIllustration';

/**
 * The muscle-target picture of an exercise (rendered from our 3D model, cached), or null while it is being
 * drawn and when this device cannot draw it. Callers show the 2D muscle map meanwhile.
 */
export function useExerciseIllustration(exercise: Pick<CatalogExercise, 'primaryMuscles' | 'secondaryMuscles'>): string | null {
  const primary = exercise.primaryMuscles.join(',');
  const secondary = exercise.secondaryMuscles.join(',');
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null });
  const key = `${primary}|${secondary}`;
  useEffect(() => {
    let alive = true;
    void exerciseIllustrationUrl(exercise).then((url) => {
      if (alive) setState({ key, url });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the muscles that matter
  }, [key]);
  return state.key === key ? state.url : null;
}
