import { describe, expect, it } from 'vitest';
import { intensityStep, muscleLoad, muscleLoadForExercise } from './muscleLoad';
import type { CatalogExercise } from './types';

const ex = (id: string, primaryMuscles: CatalogExercise['primaryMuscles'], secondaryMuscles: CatalogExercise['secondaryMuscles']): CatalogExercise => ({
  id,
  nameAr: id,
  nameEn: id,
  primaryMuscles,
  secondaryMuscles,
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  force: null,
  mechanic: null,
  images: [],
  isCustom: false,
});

const catalog = new Map([
  ['squat', ex('squat', ['quads'], ['glutes', 'hamstrings'])],
  ['thrust', ex('thrust', ['glutes'], ['hamstrings'])],
  ['curl', ex('curl', ['biceps'], ['forearms'])],
]);

describe('muscleLoad', () => {
  it('weights primary 1 and secondary 0.5 per set, sorted by score', () => {
    // squat 4 sets: quads 4, glutes 2, hamstrings 2. thrust 3 sets: glutes 3, hamstrings 1.5
    const load = muscleLoad([{ exerciseId: 'squat', sets: 4 }, { exerciseId: 'thrust', sets: 3 }], catalog);
    expect(load).toEqual([
      { muscle: 'glutes', score: 5, intensity: 1, role: 'primary' },
      { muscle: 'quads', score: 4, intensity: 0.8, role: 'primary' },
      { muscle: 'hamstrings', score: 3.5, intensity: 0.7, role: 'secondary' },
    ]);
  });

  it('counts an item without sets as one set and ignores unknown exercises and non-positive sets', () => {
    const load = muscleLoad([{ exerciseId: 'curl' }, { exerciseId: 'ghost', sets: 5 }, { exerciseId: 'squat', sets: 0 }], catalog);
    expect(load.map((l) => [l.muscle, l.score])).toEqual([['biceps', 1], ['forearms', 0.5]]);
  });

  it('accepts custom weights and returns [] for an empty day', () => {
    expect(muscleLoad([], catalog)).toEqual([]);
    const load = muscleLoad([{ exerciseId: 'curl', sets: 2 }], catalog, { primary: 1, secondary: 0 });
    expect(load).toEqual([{ muscle: 'biceps', score: 2, intensity: 1, role: 'primary' }]);
  });

  it('breaks score ties in muscle-group order', () => {
    const load = muscleLoad([{ exerciseId: 'curl' }, { exerciseId: 'squat' }], catalog);
    expect(load.slice(0, 2).map((l) => l.muscle)).toEqual(['biceps', 'quads']);
  });
});

describe('muscleLoadForExercise', () => {
  it('colours one exercise: primary full, secondary at the secondary weight', () => {
    expect(muscleLoadForExercise(ex('x', ['chest'], ['triceps', 'shoulders']))).toEqual([
      { muscle: 'chest', score: 1, intensity: 1, role: 'primary' },
      { muscle: 'shoulders', score: 0.5, intensity: 0.5, role: 'secondary' },
      { muscle: 'triceps', score: 0.5, intensity: 0.5, role: 'secondary' },
    ]);
  });
});

describe('intensityStep', () => {
  it('buckets 0..1 into colour steps', () => {
    expect(intensityStep(0, 3)).toBe(0);
    expect(intensityStep(0.01, 3)).toBe(1);
    expect(intensityStep(0.34, 3)).toBe(2);
    expect(intensityStep(1, 3)).toBe(3);
    expect(intensityStep(7, 3)).toBe(3);
  });
});
