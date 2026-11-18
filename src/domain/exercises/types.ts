import type {
  EquipmentId,
  ExerciseCategory,
  ExerciseForce,
  ExerciseLevel,
  ExerciseMechanic,
  JointStress,
  MuscleGroupId,
} from './pack';

/**
 * Where an exercise photo lives: a file of the bundled pack (fetched on demand, see docs/EXERCISE_PACK.md)
 * or an image the trainer stored on the device (Blob in the data layer's images table).
 */
export type ExerciseImage = { kind: 'pack'; path: string } | { kind: 'stored'; imageId: string };

/** One exercise as the app sees it: built-in pack entry or trainer custom exercise, overrides applied. */
export interface CatalogExercise {
  id: string;
  nameEn: string;
  nameAr: string;
  primaryMuscles: readonly MuscleGroupId[];
  secondaryMuscles: readonly MuscleGroupId[];
  equipment: EquipmentId;
  level: ExerciseLevel;
  category: ExerciseCategory;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  images: readonly ExerciseImage[];
  isCustom: boolean;
  /** Short Arabic coaching cues (2-4 lines); absent when none were written. */
  cues?: readonly string[];
  /** The same cues in short English, shown when the app language is English. */
  cuesEn?: readonly string[];
  /** True when the trainer renamed this built-in exercise in Arabic: that name wins in English too, unless... */
  renamed?: boolean;
  /** ...the trainer also typed their own English name (then `nameEn` holds it and wins in English). */
  renamedEn?: boolean;
  /** 1-based rank in the «الأشهر» (most common) set; undefined for the rest. Lower = more common. */
  popularRank?: number;
  /**
   * Joint load (knee / shoulder / lower back): set on every built-in exercise (from the pack, or derived by
   * rule when an older pack lacks it). Custom exercises get the rule-derived value too.
   */
  jointStress?: JointStress;
  /** Doable at home (body weight, bands, dumbbells, kettlebell, ball, mat). */
  homeFriendly?: boolean;
  /** Attribution for the pack photos (CC BY-SA sources); dropped when the trainer replaces the photos. */
  imageCredit?: string;
}

/** A trainer-created exercise (stored in the data layer). */
export interface CustomExerciseInput {
  id: string;
  nameAr: string;
  /** Optional; custom exercises often have an Arabic name only. */
  nameEn?: string;
  primaryMuscles: readonly MuscleGroupId[];
  secondaryMuscles?: readonly MuscleGroupId[];
  equipment?: EquipmentId;
  level?: ExerciseLevel;
  category?: ExerciseCategory;
  imageIds?: readonly string[];
}

/** The trainer's edits to a built-in exercise. Unset fields keep the built-in value. */
export interface ExerciseOverride {
  exerciseId: string;
  nameAr?: string;
  /** The trainer's English name; empty or absent keeps the pack's English name. */
  nameEn?: string;
  /** Trainer photos replacing the pack photos. An empty array keeps the pack photos. */
  imageIds?: readonly string[];
  hidden?: boolean;
}
