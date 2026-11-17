import type {
  EquipmentId,
  ExerciseCategory,
  ExerciseForce,
  ExerciseLevel,
  ExerciseMechanic,
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
  /** 1-based rank in the «الأشهر» (most common) set; undefined for the rest. Lower = more common. */
  popularRank?: number;
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
  /** Trainer photos replacing the pack photos. An empty array keeps the pack photos. */
  imageIds?: readonly string[];
  hidden?: boolean;
}
