import { describe, expect, it } from 'vitest';
import {
  DATASET_MUSCLE_TO_GROUP,
  MUSCLE_GROUP_IDS,
  buildExercisePack,
  buildPackExercise,
  packImageFileName,
  toCategoryId,
  toEquipmentId,
  toMuscleGroupIds,
  type DatasetExercise,
} from './pack';

const squat: DatasetExercise = {
  id: 'Barbell_Full_Squat',
  name: 'Barbell Full Squat',
  force: 'push',
  level: 'intermediate',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['calves', 'glutes', 'hamstrings', 'lower back'],
  instructions: ['Some undocumented English text that must not ship.'],
  category: 'powerlifting',
  images: ['Barbell_Full_Squat/0.jpg', 'Barbell_Full_Squat/1.jpg'],
};

describe('dataset muscle mapping', () => {
  it('maps every muscle name used by free-exercise-db to an app group', () => {
    const datasetNames = [
      'abdominals', 'hamstrings', 'adductors', 'quadriceps', 'biceps', 'shoulders', 'chest', 'middle back',
      'calves', 'glutes', 'lower back', 'lats', 'triceps', 'traps', 'forearms', 'neck', 'abductors',
    ];
    for (const name of datasetNames) expect(MUSCLE_GROUP_IDS).toContain(DATASET_MUSCLE_TO_GROUP[name]);
  });

  it('translates names, is case/space tolerant, de-duplicates and drops unknown names', () => {
    expect(toMuscleGroupIds(['Quadriceps', ' abdominals ', 'quadriceps', 'spleen'])).toEqual(['quads', 'abs']);
    expect(toMuscleGroupIds(['middle back', 'lower back'])).toEqual(['middle_back', 'lower_back']);
  });

  it('has about 20 stable, unique, snake_case group ids', () => {
    expect(new Set(MUSCLE_GROUP_IDS).size).toBe(MUSCLE_GROUP_IDS.length);
    expect(MUSCLE_GROUP_IDS.length).toBeGreaterThanOrEqual(18);
    for (const id of MUSCLE_GROUP_IDS) expect(id).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});

describe('field normalisation', () => {
  it('maps equipment, with null meaning "other"', () => {
    expect(toEquipmentId('body only')).toBe('body_only');
    expect(toEquipmentId('e-z curl bar')).toBe('ez_bar');
    expect(toEquipmentId('kettlebells')).toBe('kettlebell');
    expect(toEquipmentId(null)).toBe('other');
    expect(toEquipmentId('hovercraft')).toBe('other');
  });

  it('maps categories to snake_case ids', () => {
    expect(toCategoryId('olympic weightlifting')).toBe('olympic_weightlifting');
    expect(toCategoryId('strength')).toBe('strength');
    expect(toCategoryId('unknown')).toBe('strength');
  });
});

describe('packImageFileName', () => {
  it('is flat and keeps the dataset id', () => {
    expect(packImageFileName('3_4_Sit-Up', 1, 'webp')).toBe('3_4_Sit-Up-1.webp');
  });
});

describe('buildPackExercise', () => {
  it('builds a compact entry without the English instructions', () => {
    const entry = buildPackExercise(squat, 'بار فول سكوات', ['Barbell_Full_Squat-0.webp']);
    expect(entry).toEqual({
      id: 'Barbell_Full_Squat',
      en: 'Barbell Full Squat',
      ar: 'بار فول سكوات',
      primary: ['quads'],
      secondary: ['calves', 'glutes', 'hamstrings', 'lower_back'],
      equipment: 'barbell',
      level: 'intermediate',
      category: 'powerlifting',
      force: 'push',
      mechanic: 'compound',
      images: ['Barbell_Full_Squat-0.webp'],
    });
    expect(JSON.stringify(entry)).not.toContain('undocumented');
  });

  it('never lists a muscle as both primary and secondary', () => {
    const entry = buildPackExercise({ ...squat, secondaryMuscles: ['quadriceps', 'glutes'] }, 'x', []);
    expect(entry.secondary).toEqual(['glutes']);
  });

  it('falls back to the English name when no Arabic name exists, and nulls unknown force/mechanic', () => {
    const entry = buildPackExercise({ ...squat, force: null, mechanic: null }, undefined, []);
    expect(entry.ar).toBe('Barbell Full Squat');
    expect(entry.force).toBeNull();
    expect(entry.mechanic).toBeNull();
  });
});

describe('buildExercisePack', () => {
  it('sorts by id, joins Arabic names by id and records image settings', () => {
    const other: DatasetExercise = { ...squat, id: 'Air_Bike', name: 'Air Bike', images: [] };
    const pack = buildExercisePack({
      sources: [squat, other],
      arabicNames: new Map([['Barbell_Full_Squat', 'بار فول سكوات'], ['Air_Bike', 'إير بايك']]),
      imagesById: new Map([['Barbell_Full_Squat', ['Barbell_Full_Squat-0.webp', 'Barbell_Full_Squat-1.webp']]]),
      image: { format: 'webp', maxSize: 480, quality: 60 },
      source: 'yuhonas/free-exercise-db',
    });
    expect(pack.version).toBe(1);
    expect(pack.count).toBe(2);
    expect(pack.exercises.map((e) => e.id)).toEqual(['Air_Bike', 'Barbell_Full_Squat']);
    expect(pack.exercises[0]?.ar).toBe('إير بايك');
    expect(pack.exercises[0]?.images).toEqual([]);
    expect(pack.exercises[1]?.images).toHaveLength(2);
    expect(pack.image).toEqual({ format: 'webp', maxSize: 480, quality: 60, base: 'img/' });
  });
});
