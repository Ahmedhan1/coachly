import { describe, expect, it } from 'vitest';
import { catalogFromPack, customToCatalog, mergeCatalog } from './catalog';
import {
  categoryLabel,
  equipmentLabel,
  exerciseAltName,
  exerciseCues,
  exerciseName,
  levelLabel,
  muscleLabel,
} from './display';
import type { ExercisePack } from './pack';

const pack: ExercisePack = {
  version: 1,
  source: 'test',
  count: 1,
  image: { format: 'webp', maxSize: 480, quality: 60, base: 'img/' },
  imageBytes: 0,
  exercises: [
    {
      id: 'Barbell_Squat', en: 'Barbell Back Squat', ar: 'سكوات بالبار', primary: ['quads'], secondary: ['glutes'],
      equipment: 'barbell', level: 'beginner', category: 'strength', force: 'push', mechanic: 'compound', images: [],
      cues: ['البار على الترابس'], cuesEn: ['Bar on your traps'],
    },
  ],
};
const builtin = catalogFromPack(pack, '');
const squat = builtin[0]!;

describe('exerciseName', () => {
  it('shows the Arabic name in Arabic and the English name in English', () => {
    expect(exerciseName(squat, 'ar')).toBe('سكوات بالبار');
    expect(exerciseName(squat, 'en')).toBe('Barbell Back Squat');
  });

  it("keeps the trainer's rename in both languages", () => {
    const [renamed] = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Barbell_Squat', nameAr: 'سكوات الكابتن' }] });
    expect(exerciseName(renamed!, 'en')).toBe('سكوات الكابتن');
    expect(exerciseName(renamed!, 'ar')).toBe('سكوات الكابتن');
    expect(exerciseAltName(renamed!, 'en')).toBeNull();
  });

  it('an override that only repeats the default name is not a rename', () => {
    const [same] = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Barbell_Squat', nameAr: 'سكوات بالبار', imageIds: ['x'] }] });
    expect(exerciseName(same!, 'en')).toBe('Barbell Back Squat');
  });

  it('custom exercises: the English name the trainer typed, else their Arabic name', () => {
    const withEn = customToCatalog({ id: 'c1', nameAr: 'تمرين خاص', nameEn: 'My Move', primaryMuscles: ['abs'] });
    const arOnly = customToCatalog({ id: 'c2', nameAr: 'تمرين خاص', primaryMuscles: ['abs'] });
    expect(exerciseName(withEn, 'en')).toBe('My Move');
    expect(exerciseName(arOnly, 'en')).toBe('تمرين خاص');
  });

  it('alt name is the other language, or null when it is the same', () => {
    expect(exerciseAltName(squat, 'ar')).toBe('Barbell Back Squat');
    expect(exerciseAltName(squat, 'en')).toBe('سكوات بالبار');
  });
});

describe('localised labels and cues', () => {
  it('picks cues by language, falling back to Arabic', () => {
    expect(exerciseCues(squat, 'en')).toEqual(['Bar on your traps']);
    expect(exerciseCues(squat, 'ar')).toEqual(['البار على الترابس']);
    expect(exerciseCues({ ...squat, cuesEn: undefined }, 'en')).toEqual(['البار على الترابس']);
  });

  it('labels muscles, equipment, level and category', () => {
    expect(muscleLabel('glutes', 'en')).toBe('Glutes');
    expect(muscleLabel('glutes', 'ar')).toBe('جلوتس');
    expect(equipmentLabel('body_only', 'en')).toBe('Bodyweight');
    expect(levelLabel('expert', 'en')).toBe('Advanced');
    expect(categoryLabel('olympic_weightlifting', 'en')).toBe('Olympic Weightlifting');
    expect(equipmentLabel('barbell', 'ar')).toBe('بار');
  });
});

describe("the trainer's English name", () => {
  it('wins in English and leaves the Arabic name (and an Arabic rename) alone', () => {
    const [en] = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Barbell_Squat', nameAr: 'سكوات بالبار', nameEn: 'Coach Squat' }] });
    expect(exerciseName(en!, 'en')).toBe('Coach Squat');
    expect(exerciseName(en!, 'ar')).toBe('سكوات بالبار');
    const [both] = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Barbell_Squat', nameAr: 'سكوات الكابتن', nameEn: 'Coach Squat' }] });
    expect(exerciseName(both!, 'en')).toBe('Coach Squat');
    expect(exerciseName(both!, 'ar')).toBe('سكوات الكابتن');
  });

  it('an empty English override keeps the pack name', () => {
    const [same] = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Barbell_Squat', nameEn: '  ' }] });
    expect(exerciseName(same!, 'en')).toBe('Barbell Back Squat');
  });
});
