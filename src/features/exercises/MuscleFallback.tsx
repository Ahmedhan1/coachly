import { illustrationSpec, type CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { MuscleMap } from '@/ui/MuscleMap';

/** Flat (SVG) muscle map with the same view and colours as the 3D picture; works with no WebGL and no network. */
export function MuscleFallback({ exercise, size }: { exercise: CatalogExercise; size: number }) {
  const { view, intensities } = illustrationSpec(exercise);
  return <MuscleMap view={view} size={size} intensities={intensities} label={t('training.library.photoFallback')} />;
}
