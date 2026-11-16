import { describe, expect, it } from 'vitest';
import { catalogById, catalogFromPack, mergeCatalog } from './catalog';
import type { ExercisePack, PackExercise } from './pack';

const entry = (id: string, extra: Partial<PackExercise> = {}): PackExercise => ({
  id,
  en: id.replace(/_/g, ' '),
  ar: `ar ${id}`,
  primary: ['glutes'],
  secondary: ['hamstrings'],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  force: 'push',
  mechanic: 'compound',
  images: [`${id}-0.webp`, `${id}-1.webp`],
  ...extra,
});

const pack: ExercisePack = {
  version: 1,
  source: 'test',
  count: 2,
  image: { format: 'webp', maxSize: 480, quality: 60, base: 'img/' },
  imageBytes: 0,
  exercises: [entry('Hip_Thrust'), entry('Plank', { images: [], primary: ['abs'], secondary: [] })],
};

describe('catalogFromPack', () => {
  it('turns pack entries into built-in catalog exercises with resolved image paths', () => {
    const catalog = catalogFromPack(pack, 'exercise-pack/');
    expect(catalog[0]).toEqual({
      id: 'Hip_Thrust',
      nameEn: 'Hip Thrust',
      nameAr: 'ar Hip_Thrust',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings'],
      equipment: 'barbell',
      level: 'beginner',
      category: 'strength',
      force: 'push',
      mechanic: 'compound',
      images: [
        { kind: 'pack', path: 'exercise-pack/img/Hip_Thrust-0.webp' },
        { kind: 'pack', path: 'exercise-pack/img/Hip_Thrust-1.webp' },
      ],
      isCustom: false,
    });
    expect(catalog[1]?.images).toEqual([]);
  });
});

describe('mergeCatalog', () => {
  const builtin = catalogFromPack(pack, '');

  it('applies trainer name and photo overrides and hides hidden exercises', () => {
    const merged = mergeCatalog(builtin, {
      overrides: [
        { exerciseId: 'Hip_Thrust', nameAr: '  هيب ثرست المدرب  ', imageIds: ['img-1'] },
        { exerciseId: 'Plank', hidden: true },
        { exerciseId: 'Gone', nameAr: 'x' },
      ],
    });
    expect(merged.map((e) => e.id)).toEqual(['Hip_Thrust']);
    expect(merged[0]?.nameAr).toBe('هيب ثرست المدرب');
    expect(merged[0]?.images).toEqual([{ kind: 'stored', imageId: 'img-1' }]);
    expect(merged[0]?.isCustom).toBe(false);
  });

  it('ignores blank override names and empty photo lists', () => {
    const merged = mergeCatalog(builtin, { overrides: [{ exerciseId: 'Hip_Thrust', nameAr: '   ', imageIds: [] }] });
    expect(merged[0]?.nameAr).toBe('ar Hip_Thrust');
    expect(merged[0]?.images[0]).toEqual({ kind: 'pack', path: 'img/Hip_Thrust-0.webp' });
  });

  it('appends custom exercises with defaults; a custom id equal to a built-in id replaces it', () => {
    const merged = mergeCatalog(builtin, {
      custom: [
        { id: 'c1', nameAr: 'تمرين خاص', primaryMuscles: ['glutes', 'glutes'], secondaryMuscles: ['glutes', 'quads'], imageIds: ['p1'] },
        { id: 'Plank', nameAr: 'بلانك بتاعي', primaryMuscles: ['abs'] },
      ],
    });
    expect(merged.map((e) => e.id)).toEqual(['Hip_Thrust', 'Plank', 'c1']);
    const custom = merged[2];
    expect(custom).toMatchObject({
      nameAr: 'تمرين خاص',
      nameEn: '',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['quads'],
      equipment: 'other',
      level: 'beginner',
      category: 'strength',
      images: [{ kind: 'stored', imageId: 'p1' }],
      isCustom: true,
    });
    expect(merged[1]?.nameAr).toBe('بلانك بتاعي');
    expect(merged[1]?.isCustom).toBe(true);
  });

  it('indexes by id', () => {
    expect(catalogById(builtin).get('Plank')?.primaryMuscles).toEqual(['abs']);
  });
});
