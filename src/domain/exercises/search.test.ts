import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchExercises } from './search';
import type { CatalogExercise } from './types';

const ex = (id: string, nameAr: string, nameEn: string, extra: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id,
  nameAr,
  nameEn,
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  force: null,
  mechanic: null,
  images: [],
  isCustom: false,
  ...extra,
});

describe('normalizeSearchText', () => {
  it('strips tashkeel and tatweel', () => {
    expect(normalizeSearchText('بَنْش بـــرس')).toBe('بنش برس');
  });

  it('unifies alef, ya, ta marbuta, hamza seats and Arabic digits', () => {
    expect(normalizeSearchText('أإآٱا')).toBe('ااااا');
    expect(normalizeSearchText('رومانيى')).toBe('روماني' + 'ي');
    expect(normalizeSearchText('كرة')).toBe('كره');
    expect(normalizeSearchText('مؤخر ئ')).toBe('موخر ي');
    expect(normalizeSearchText('٣/٤ سيت أب')).toBe('3 4 سيت اب');
  });

  it('lowercases English and turns punctuation into single spaces', () => {
    expect(normalizeSearchText('  Barbell   Full-Squat (Wide) ')).toBe('barbell full squat wide');
  });
});

describe('searchExercises', () => {
  const list = [
    ex('bench', 'بنش برس', 'Barbell Bench Press'),
    ex('incline', 'إنكلاين دامبل بنش برس', 'Incline Dumbbell Bench Press'),
    ex('thrust', 'هيب ثرست', 'Hip Thrust', { primaryMuscles: ['glutes'] }),
    ex('bridge', 'جلوت بريدج', 'Glute Bridge', { primaryMuscles: ['glutes'] }),
    ex('kick', 'كيبل كيك باك', 'Cable Kickback', { secondaryMuscles: ['glutes'], primaryMuscles: ['hamstrings'] }),
  ];

  it('returns everything (in input order) for an empty query', () => {
    expect(searchExercises(list, '  ').map((e) => e.id)).toEqual(list.map((e) => e.id));
  });

  it('ranks exact > prefix > word-prefix > contains', () => {
    expect(searchExercises(list, 'بنش برس').map((e) => e.id)).toEqual(['bench', 'incline']);
  });

  it('matches Arabic regardless of hamza/tashkeel spelling', () => {
    expect(searchExercises(list, 'انكلاين').map((e) => e.id)).toEqual(['incline']);
    expect(searchExercises(list, 'هِيب ثَرست').map((e) => e.id)).toEqual(['thrust']);
  });

  it('matches English case-insensitively and requires every token', () => {
    expect(searchExercises(list, 'bench DUMB').map((e) => e.id)).toEqual(['incline']);
    expect(searchExercises(list, 'hip').map((e) => e.id)).toEqual(['thrust']);
  });

  it('finds exercises by muscle label, primary before secondary, after name matches', () => {
    expect(searchExercises(list, 'جلوتس').map((e) => e.id)).toEqual(['bridge', 'thrust', 'kick']);
    expect(searchExercises(list, 'جلوت').map((e) => e.id)[0]).toBe('bridge');
  });

  it('respects the limit', () => {
    expect(searchExercises(list, 'برس', 1)).toHaveLength(1);
  });
});

describe('searchExercises – «الأشهر» tie-break', () => {
  it('ranks the more common exercise first when scores tie', () => {
    const list = [
      ex('a', 'بنش برس بالدامبل', 'Dumbbell Bench Press'),
      ex('b', 'بنش برس بالبار', 'Barbell Bench Press', { popularRank: 1 }),
      ex('c', 'بنش برس على السميث', 'Smith Bench Press', { popularRank: 5 }),
    ];
    expect(searchExercises(list, 'بنش').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('still finds exercises by their English name', () => {
    const list = [ex('b', 'بنش برس بالبار', 'Barbell Bench Press - Medium Grip')];
    expect(searchExercises(list, 'barbell bench').map((e) => e.id)).toEqual(['b']);
  });
});
