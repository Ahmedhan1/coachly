/**
 * Arabic labels for muscle groups and exercise fields. Every label is looked up in the fitness dictionary
 * (src/i18n/fitness-terms.ts) — transliterated, never translated — so the forbidden-words gate covers it.
 */
import { DATASET_FIELD_TERMS, EQUIPMENT_TERMS, MUSCLE_TERMS } from '../../i18n/fitness-terms';
import {
  MUSCLE_GROUP_IDS,
  type EquipmentId,
  type ExerciseCategory,
  type ExerciseLevel,
  type MuscleGroupId,
} from './pack';

export type BodyView = 'front' | 'back';
export type BodyRegion = 'upper' | 'core' | 'lower';

export interface MuscleGroup {
  id: MuscleGroupId;
  labelAr: string;
  labelEn: string;
  /** Body views of the 2D map where this group is drawn. */
  views: readonly BodyView[];
  region: BodyRegion;
}

function term(group: Readonly<Record<string, string>>, key: string): string {
  const value = group[key];
  if (value === undefined) throw new Error(`fitness dictionary is missing "${key}"`);
  return value;
}

const FRONT: readonly BodyView[] = ['front'];
const BACK: readonly BodyView[] = ['back'];
const BOTH: readonly BodyView[] = ['front', 'back'];

const GROUP_INFO: Readonly<Record<MuscleGroupId, { dict: string; en: string; views: readonly BodyView[]; region: BodyRegion }>> = {
  chest: { dict: 'chest', en: 'Chest', views: FRONT, region: 'upper' },
  shoulders: { dict: 'shoulders', en: 'Shoulders', views: BOTH, region: 'upper' },
  biceps: { dict: 'biceps', en: 'Biceps', views: FRONT, region: 'upper' },
  triceps: { dict: 'triceps', en: 'Triceps', views: BACK, region: 'upper' },
  forearms: { dict: 'forearms', en: 'Forearms', views: BOTH, region: 'upper' },
  abs: { dict: 'abs', en: 'Abs', views: FRONT, region: 'core' },
  obliques: { dict: 'obliques', en: 'Obliques', views: FRONT, region: 'core' },
  neck: { dict: 'neck', en: 'Neck', views: BOTH, region: 'upper' },
  traps: { dict: 'traps', en: 'Traps', views: BOTH, region: 'upper' },
  lats: { dict: 'lats', en: 'Lats', views: BACK, region: 'upper' },
  middle_back: { dict: 'middle back', en: 'Middle Back', views: BACK, region: 'upper' },
  lower_back: { dict: 'lower back', en: 'Lower Back', views: BACK, region: 'core' },
  glutes: { dict: 'glutes', en: 'Glutes', views: BACK, region: 'lower' },
  hip_flexors: { dict: 'hip flexors', en: 'Hip Flexors', views: FRONT, region: 'lower' },
  quads: { dict: 'quads', en: 'Quads', views: FRONT, region: 'lower' },
  hamstrings: { dict: 'hamstrings', en: 'Hamstrings', views: BACK, region: 'lower' },
  adductors: { dict: 'adductors', en: 'Adductors', views: FRONT, region: 'lower' },
  abductors: { dict: 'abductors', en: 'Abductors', views: BOTH, region: 'lower' },
  calves: { dict: 'calves', en: 'Calves', views: BACK, region: 'lower' },
  tibialis: { dict: 'tibialis', en: 'Tibialis', views: FRONT, region: 'lower' },
};

export const MUSCLE_GROUPS: readonly MuscleGroup[] = MUSCLE_GROUP_IDS.map((id) => {
  const info = GROUP_INFO[id];
  return { id, labelAr: term(MUSCLE_TERMS, info.dict), labelEn: info.en, views: info.views, region: info.region };
});

const GROUP_BY_ID: ReadonlyMap<MuscleGroupId, MuscleGroup> = new Map(MUSCLE_GROUPS.map((g) => [g.id, g]));

export function isMuscleGroupId(value: string): value is MuscleGroupId {
  return GROUP_BY_ID.has(value as MuscleGroupId);
}

export function muscleGroup(id: MuscleGroupId): MuscleGroup {
  const group = GROUP_BY_ID.get(id);
  if (group === undefined) throw new Error(`unknown muscle group ${id}`);
  return group;
}

export function muscleGroupLabelAr(id: MuscleGroupId): string {
  return muscleGroup(id).labelAr;
}

const EQUIPMENT_DICT_KEY: Readonly<Record<EquipmentId, string>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  kettlebell: 'kettlebell',
  bands: 'bands',
  body_only: 'body only',
  medicine_ball: 'medicine ball',
  exercise_ball: 'exercise ball',
  ez_bar: 'e-z curl bar',
  foam_roll: 'foam roll',
  other: 'other',
};

export const EQUIPMENT_LABELS_AR: Readonly<Record<EquipmentId, string>> = Object.fromEntries(
  Object.entries(EQUIPMENT_DICT_KEY).map(([id, key]) => [id, term(EQUIPMENT_TERMS, key)]),
) as Record<EquipmentId, string>;

export const LEVEL_LABELS_AR: Readonly<Record<ExerciseLevel, string>> = DATASET_FIELD_TERMS.level;

export const CATEGORY_LABELS_AR: Readonly<Record<ExerciseCategory, string>> = {
  strength: DATASET_FIELD_TERMS.category.strength,
  stretching: DATASET_FIELD_TERMS.category.stretching,
  plyometrics: DATASET_FIELD_TERMS.category.plyometrics,
  strongman: DATASET_FIELD_TERMS.category.strongman,
  powerlifting: DATASET_FIELD_TERMS.category.powerlifting,
  cardio: DATASET_FIELD_TERMS.category.cardio,
  olympic_weightlifting: DATASET_FIELD_TERMS.category['olympic weightlifting'],
};
