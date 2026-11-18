import type { ExercisePack, MuscleGroupId } from './pack';
import type { CatalogExercise, CustomExerciseInput, ExerciseImage, ExerciseOverride } from './types';
import { deriveHomeFriendly, deriveJointStress } from './jointStress';

const unique = (ids: readonly MuscleGroupId[]): MuscleGroupId[] => [...new Set(ids)];

/**
 * Built-in catalog from the pack. `packUrl` is where exercises.json was loaded from (folder, with or
 * without trailing slash, '' for relative paths), e.g. 'exercise-pack/'.
 */
export function catalogFromPack(pack: ExercisePack, packUrl: string): CatalogExercise[] {
  const folder = packUrl === '' || packUrl.endsWith('/') ? packUrl : `${packUrl}/`;
  const base = `${folder}${pack.image.base}`;
  const list = pack.exercises.map((e): CatalogExercise => ({
    id: e.id,
    nameEn: e.en,
    nameAr: e.ar,
    primaryMuscles: e.primary,
    secondaryMuscles: e.secondary,
    equipment: e.equipment,
    level: e.level,
    category: e.category,
    force: e.force,
    mechanic: e.mechanic,
    images: e.images.map((file): ExerciseImage => ({ kind: 'pack', path: `${base}${file}` })),
    isCustom: false,
    ...(e.cues !== undefined && e.cues.length > 0 ? { cues: e.cues } : {}),
    ...(e.cuesEn !== undefined && e.cuesEn.length > 0 ? { cuesEn: e.cuesEn } : {}),
    ...(e.popular !== undefined ? { popularRank: e.popular } : {}),
    jointStress: e.jointStress ?? deriveJointStress(e),
    homeFriendly: e.homeFriendly ?? deriveHomeFriendly(e),
  }));
  return popularFirst(list);
}

/** «الأشهر» first (by rank), everything else after in its original order. Stable; does not mutate. */
export function popularFirst<T extends { popularRank?: number }>(list: readonly T[]): T[] {
  return list
    .map((item, index) => ({ item, index, rank: item.popularRank ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((r) => r.item);
}

const stored = (ids: readonly string[]): ExerciseImage[] => ids.map((imageId) => ({ kind: 'stored', imageId }));

function applyOverride(exercise: CatalogExercise, override: ExerciseOverride | undefined): CatalogExercise {
  if (override === undefined) return exercise;
  const name = override.nameAr?.trim();
  const renamed = name !== undefined && name !== '' && name !== exercise.nameAr;
  const nameEn = override.nameEn?.trim();
  const renamedEn = nameEn !== undefined && nameEn !== '' && nameEn !== exercise.nameEn;
  return {
    ...exercise,
    nameAr: renamed ? name : exercise.nameAr,
    ...(renamed ? { renamed: true } : {}),
    ...(renamedEn ? { nameEn, renamedEn: true } : {}),
    images: override.imageIds !== undefined && override.imageIds.length > 0 ? stored(override.imageIds) : exercise.images,
  };
}

export function customToCatalog(custom: CustomExerciseInput): CatalogExercise {
  const primary = unique(custom.primaryMuscles);
  const secondary = unique(custom.secondaryMuscles ?? []).filter((id) => !primary.includes(id));
  const equipment = custom.equipment ?? 'other';
  const category = custom.category ?? 'strength';
  const en = custom.nameEn?.trim() ?? '';
  return {
    id: custom.id,
    nameEn: custom.nameEn?.trim() ?? '',
    nameAr: custom.nameAr.trim(),
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    equipment,
    level: custom.level ?? 'beginner',
    category,
    force: null,
    mechanic: null,
    images: stored(custom.imageIds ?? []),
    isCustom: true,
    // Rules read the English name; an Arabic-only custom exercise is judged by muscles and equipment.
    jointStress: deriveJointStress({ en, primary, secondary, equipment, category }),
    homeFriendly: deriveHomeFriendly({ en, equipment, category }),
  };
}

/**
 * Built-in catalog + trainer overrides + trainer custom exercises. Order: built-in order first, then
 * custom exercises in the given order. A custom exercise with the id of a built-in one replaces it in place.
 * Overrides for unknown ids are ignored.
 */
export function mergeCatalog(
  builtin: readonly CatalogExercise[],
  changes: { custom?: readonly CustomExerciseInput[]; overrides?: readonly ExerciseOverride[] },
): CatalogExercise[] {
  const overrides = new Map((changes.overrides ?? []).map((o) => [o.exerciseId, o]));
  const customById = new Map((changes.custom ?? []).map((c) => [c.id, customToCatalog(c)]));
  const out: CatalogExercise[] = [];
  const seen = new Set<string>();
  for (const exercise of builtin) {
    seen.add(exercise.id);
    const replacement = customById.get(exercise.id);
    if (replacement !== undefined) {
      out.push(replacement);
      continue;
    }
    const override = overrides.get(exercise.id);
    if (override?.hidden === true) continue;
    out.push(applyOverride(exercise, override));
  }
  for (const [id, custom] of customById) if (!seen.has(id)) out.push(custom);
  return out;
}

export function catalogById(catalog: readonly CatalogExercise[]): ReadonlyMap<string, CatalogExercise> {
  return new Map(catalog.map((e) => [e.id, e]));
}
