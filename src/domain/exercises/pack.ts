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
  /** Short Arabic coaching cues (2-4), our own words; absent when none were written yet. */
  cues?: string[];
  /** The same cues in short English (shown when the app language is English). */
  cuesEn?: string[];
  /** 1-based rank in the hand-picked «الأشهر» (most common) set; absent for the rest. */
  popular?: number;
  /** True for the app's own built-in additions (data-src/exercise-extras.json), not from the dataset. */
  extra?: boolean;
}

/**
 * A built-in exercise the dataset lacks (data-src/exercise-extras.json). `imagesFrom` names a dataset
 * exercise whose photos truly show the same movement; without it the app draws the muscle map.
 */
export interface ExtraExercise extends Omit<PackExercise, 'images' | 'popular' | 'extra' | 'cuesEn'> {
  imagesFrom?: string;
  popular?: boolean;
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
  /** Total bytes of all image files, so the app can show the size of "download all for offline". */
  imageBytes: number;
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

const SMALL_WORDS = new Set(['a', 'an', 'and', 'or', 'of', 'off', 'on', 'the', 'to', 'with', 'at', 'for', 'from', 'by']);

/** Plural movement words → the singular gym-standard form ("Hammer Curls" → "Hammer Curl"). */
const SINGULAR: Readonly<Record<string, string>> = {
  Flyes: 'Fly', Flys: 'Fly', Flies: 'Fly', Curls: 'Curl', Raises: 'Raise', Rows: 'Row', Extensions: 'Extension',
  Presses: 'Press', Shrugs: 'Shrug', Kickbacks: 'Kickback', Squats: 'Squat', Crunches: 'Crunch', Lunges: 'Lunge',
  Hyperextensions: 'Hyperextension', 'Sit-Ups': 'Sit-Up', 'Step-Ups': 'Step-Up', 'Chin-Ups': 'Chin-Up',
  'Pull-Ups': 'Pull-Up', 'Push-Ups': 'Push-Up', Pushups: 'Push-Up', Pullups: 'Pull-Up', Situps: 'Sit-Up',
  Tricep: 'Triceps', Bicep: 'Biceps', Pulldowns: 'Pulldown', Pullovers: 'Pullover', Deadlifts: 'Deadlift',
};

const EQUIPMENT_WORDS = new Set(['Barbell', 'Dumbbell', 'Cable', 'Kettlebell', 'EZ-Bar']);
/** Words that read naturally before the equipment ("Incline Dumbbell Press"), so the equipment stays put. */
const BEFORE_EQUIPMENT = new Set([
  'Incline', 'Decline', 'Flat', 'Seated', 'Standing', 'Lying', 'Kneeling', 'One-Arm', 'Single-Arm', 'One',
  'Alternating', 'Alternate', 'One-Legged', 'Single-Leg', 'Reverse-Grip', 'Prone', 'Supine', 'Close-Grip',
  'Wide-Grip', 'Weighted', 'Two-Arm', 'Double', 'Advanced', 'Low', 'High', 'Elevated',
]);

const capitalise = (word: string): string =>
  word.length > 0 && /^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word;

/**
 * Gym-standard English name from a free-exercise-db name: drops "Medium Grip" noise, turns "A - B" into
 * "A (B)" ("With Bands" becomes a "Band" prefix), "Jogging, Treadmill" into "Treadmill Jogging", leading
 * grips into a suffix ("Lat Pulldown (Wide Grip)"), plurals into the singular, and moves the equipment to
 * the front ("Front Dumbbell Raise" → "Dumbbell Front Raise"). Hand-written names in
 * data-src/exercise-names.en.json win over this.
 */
export function cleanEnglishName(raw: string): string {
  let name = raw.replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*-\s*Medium Grip$/i, '').replace(/ Medium$/, '');
  const bands = /^(.*?)\s+-\s+With Bands$/i.exec(name);
  if (bands?.[1] !== undefined) name = `Band ${bands[1]}`;
  name = name.replace(/^(.+?)\s+-\s*(.+)$/, '$1 ($2)');
  const comma = /^([^,]+),\s*([^,]+)$/.exec(name);
  if (comma?.[1] !== undefined && comma[2] !== undefined) name = `${comma[2]} ${comma[1]}`;
  const grip = /^(Wide|Close)-Grip (.+)$/.exec(name);
  if (grip?.[1] !== undefined && grip[2] !== undefined) name = `${grip[2]} (${grip[1]} Grip)`;
  let words = name.split(' ').map((w) => {
    const bare = w.replace(/[()]/g, '');
    const single = SINGULAR[bare];
    return single === undefined ? w : w.replace(bare, single);
  });
  if (words.length >= 2 && words[0] === 'Step' && words[1]?.startsWith('Ups')) words.splice(0, 2, 'Step-Up');
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1] === 'Step' && words[i] === 'Ups') words.splice(i - 1, 2, 'Step-Up');
  }
  const at = words.findIndex((w) => EQUIPMENT_WORDS.has(w));
  if (at > 0 && at <= 2 && at < words.length - 1 && words.slice(0, at).every((w) => !BEFORE_EQUIPMENT.has(w))) {
    const equipment = words[at] as string;
    words = [equipment, ...words.slice(0, at), ...words.slice(at + 1)];
  }
  return words
    .map((w, i) => {
      const open = w.startsWith('(');
      const core = open ? w.slice(1) : w;
      const keepSmall = i > 0 && !open && SMALL_WORDS.has(core.toLowerCase());
      return (open ? '(' : '') + (keepSmall ? core.toLowerCase() : capitalise(core));
    })
    .join(' ');
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
    en: cleanEnglishName(source.name),
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
  imageBytes?: number;
  /** Exercise ids of the «الأشهر» set, most common first. */
  popular?: readonly string[];
  /** Exercise id → Arabic coaching cues for dataset exercises (data-src/exercise-cues.ar.json). */
  cues?: ReadonlyMap<string, readonly string[]>;
  extras?: readonly ExtraExercise[];
  /** Exercise id → hand-written English name (data-src/exercise-names.en.json); wins over the cleaned name. */
  englishNames?: ReadonlyMap<string, string>;
  /** Exercise id → short English cues (data-src/exercise-cues.en.json), dataset and extras alike. */
  cuesEn?: ReadonlyMap<string, readonly string[]>;
}

function extraToPack(extra: ExtraExercise, imagesById: ReadonlyMap<string, readonly string[]>): PackExercise {
  const { imagesFrom, popular, ...rest } = extra;
  void popular; // the rank is computed in buildExercisePack
  const primary = [...new Set(rest.primary)];
  return {
    ...rest,
    primary,
    secondary: [...new Set(rest.secondary)].filter((id) => !primary.includes(id)),
    images: imagesFrom === undefined ? [] : [...(imagesById.get(imagesFrom) ?? [])],
    extra: true,
  };
}

export function buildExercisePack(input: BuildExercisePackInput): ExercisePack {
  const fromDataset = input.sources.map((source) =>
    buildPackExercise(source, input.arabicNames.get(source.id), input.imagesById.get(source.id) ?? []),
  );
  const datasetIds = new Set(fromDataset.map((e) => e.id));
  const extras = (input.extras ?? [])
    .filter((x) => !datasetIds.has(x.id))
    .map((x) => extraToPack(x, input.imagesById));
  const popularIds = [
    ...(input.popular ?? []),
    ...(input.extras ?? []).filter((x) => x.popular === true).map((x) => x.id),
  ];
  const rank = new Map<string, number>();
  for (const id of popularIds) if (!rank.has(id)) rank.set(id, rank.size + 1);
  const exercises = [...fromDataset, ...extras]
    .map((e) => {
      const r = rank.get(e.id);
      const { cues: own, ...plain } = e;
      const cues = own !== undefined && own.length > 0 ? own : input.cues?.get(e.id);
      const named = { ...plain, en: input.englishNames?.get(e.id)?.trim() || plain.en };
      const withCues: PackExercise = cues !== undefined && cues.length > 0 ? { ...named, cues: [...cues] } : named;
      const en = input.cuesEn?.get(e.id);
      const withEn: PackExercise = en !== undefined && en.length > 0 ? { ...withCues, cuesEn: [...en] } : withCues;
      return r === undefined ? withEn : { ...withEn, popular: r };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    version: 1,
    source: input.source,
    count: exercises.length,
    image: { ...input.image, base: 'img/' },
    imageBytes: input.imageBytes ?? 0,
    exercises,
  };
}
