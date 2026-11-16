/**
 * The bundled exercise pack format (public/exercise-pack/exercises.json) and how it is built from
 * yuhonas/free-exercise-db.
 *
 * This file has NO imports and uses only erasable TypeScript, because the Node build script
 * (scripts/build-exercise-pack.mjs) imports it directly (Node strips the types).
 */

/**
 * App muscle groups. These ids are shared by the catalog, the 2D muscle map and the 3D mesh groups, so
 * they are stable: never rename one, only add.
 */
export const MUSCLE_GROUP_IDS = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'neck',
  'traps',
  'lats',
  'middle_back',
  'lower_back',
  'glutes',
  'hip_flexors',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'tibialis',
] as const;
export type MuscleGroupId = (typeof MUSCLE_GROUP_IDS)[number];

/** free-exercise-db muscle names → app muscle group. */
export const DATASET_MUSCLE_TO_GROUP: Readonly<Record<string, MuscleGroupId>> = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower_back',
  'middle back': 'middle_back',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
};

export const EQUIPMENT_IDS = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'bands',
  'body_only',
  'medicine_ball',
  'exercise_ball',
  'ez_bar',
  'foam_roll',
  'other',
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

const DATASET_EQUIPMENT_TO_ID: Readonly<Record<string, EquipmentId>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  kettlebells: 'kettlebell',
  bands: 'bands',
  'body only': 'body_only',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'e-z curl bar': 'ez_bar',
  'foam roll': 'foam_roll',
  other: 'other',
};

export const LEVEL_IDS = ['beginner', 'intermediate', 'expert'] as const;
export type ExerciseLevel = (typeof LEVEL_IDS)[number];

export const CATEGORY_IDS = [
  'strength',
  'stretching',
  'plyometrics',
  'strongman',
  'powerlifting',
  'cardio',
  'olympic_weightlifting',
] as const;
export type ExerciseCategory = (typeof CATEGORY_IDS)[number];

export type ExerciseForce = 'push' | 'pull' | 'static';
export type ExerciseMechanic = 'compound' | 'isolation';

/** One record of free-exercise-db dist/exercises.json. */
export interface DatasetExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  instructions?: readonly string[];
  category: string;
  images: readonly string[];
}

/** One exercise in the shipped pack. Deliberately has no instructions text (origin undocumented). */
export interface PackExercise {
  id: string;
  en: string;
  ar: string;
  primary: MuscleGroupId[];
  secondary: MuscleGroupId[];
  equipment: EquipmentId;
  level: ExerciseLevel;
  category: ExerciseCategory;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  /** File names relative to `ExercisePack.image.base`. Empty when no image could be fetched. */
  images: string[];
}

export interface PackImageSettings {
  format: 'webp' | 'jpeg';
  /** Longest side in pixels. */
  maxSize: number;
  quality: number;
}

export interface ExercisePack {
  version: 1;
  source: string;
  count: number;
  /** `base` is relative to the folder holding exercises.json. */
  image: PackImageSettings & { base: string };
  exercises: PackExercise[];
}

const norm = (value: string): string => value.trim().toLowerCase();

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

export function toMuscleGroupId(datasetName: string): MuscleGroupId | null {
  return DATASET_MUSCLE_TO_GROUP[norm(datasetName)] ?? null;
}

/** Maps dataset muscle names to app groups, in order, without duplicates; unknown names are dropped. */
export function toMuscleGroupIds(datasetNames: readonly string[]): MuscleGroupId[] {
  const out: MuscleGroupId[] = [];
  for (const name of datasetNames) {
    const id = toMuscleGroupId(name);
    if (id !== null && !out.includes(id)) out.push(id);
  }
  return out;
}

export function toEquipmentId(datasetEquipment: string | null): EquipmentId {
  if (datasetEquipment === null) return 'other';
  return DATASET_EQUIPMENT_TO_ID[norm(datasetEquipment)] ?? 'other';
}

export function toLevelId(datasetLevel: string): ExerciseLevel {
  const value = norm(datasetLevel);
  return isOneOf(LEVEL_IDS, value) ? value : 'beginner';
}

export function toCategoryId(datasetCategory: string): ExerciseCategory {
  const value = norm(datasetCategory).replace(/\s+/g, '_');
  return isOneOf(CATEGORY_IDS, value) ? value : 'strength';
}

function toForce(value: string | null): ExerciseForce | null {
  return value === 'push' || value === 'pull' || value === 'static' ? value : null;
}

function toMechanic(value: string | null): ExerciseMechanic | null {
  return value === 'compound' || value === 'isolation' ? value : null;
}

/** Flat output file name for image `index` of exercise `id`, e.g. `Air_Bike-0.webp`. */
export function packImageFileName(id: string, index: number, ext: 'webp' | 'jpg'): string {
  return `${id}-${index}.${ext}`;
}

export function buildPackExercise(
  source: DatasetExercise,
  arabicName: string | undefined,
  images: readonly string[],
): PackExercise {
  const primary = toMuscleGroupIds(source.primaryMuscles);
  const secondary = toMuscleGroupIds(source.secondaryMuscles).filter((id) => !primary.includes(id));
  const ar = arabicName?.trim();
  return {
    id: source.id,
    en: source.name,
    ar: ar !== undefined && ar !== '' ? ar : source.name,
    primary,
    secondary,
    equipment: toEquipmentId(source.equipment),
    level: toLevelId(source.level),
    category: toCategoryId(source.category),
    force: toForce(source.force),
    mechanic: toMechanic(source.mechanic),
    images: [...images],
  };
}

export interface BuildExercisePackInput {
  sources: readonly DatasetExercise[];
  /** Exercise id → default Arabic name (data-src/exercise-names.ar.json). */
  arabicNames: ReadonlyMap<string, string>;
  /** Exercise id → image file names that really exist in the pack. */
  imagesById: ReadonlyMap<string, readonly string[]>;
  image: PackImageSettings;
  source: string;
}

export function buildExercisePack(input: BuildExercisePackInput): ExercisePack {
  const exercises = [...input.sources]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((source) => buildPackExercise(source, input.arabicNames.get(source.id), input.imagesById.get(source.id) ?? []));
  return {
    version: 1,
    source: input.source,
    count: exercises.length,
    image: { ...input.image, base: 'img/' },
    exercises,
  };
}
