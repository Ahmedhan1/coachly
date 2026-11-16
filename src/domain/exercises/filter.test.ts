import { describe, expect, it } from 'vitest';
import { addFavourite, isFavourite, pruneFavourites, removeFavourite, toggleFavourite } from './favourites';
import { filterExercises } from './filter';
import type { CatalogExercise } from './types';

const ex = (id: string, extra: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id,
  nameAr: id,
  nameEn: id,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  force: null,
  mechanic: null,
  images: [],
  isCustom: false,
  ...extra,
});

const list = [
  ex('bench'),
  ex('db-fly', { equipment: 'dumbbell', level: 'intermediate', secondaryMuscles: ['shoulders'] }),
  ex('squat', { primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], level: 'expert' }),
  ex('stretch', { primaryMuscles: ['hamstrings'], secondaryMuscles: [], equipment: 'body_only', category: 'stretching', isCustom: true }),
];
const ids = (r: CatalogExercise[]) => r.map((e) => e.id);

describe('filterExercises', () => {
  it('returns everything with no criteria', () => {
    expect(ids(filterExercises(list, {}))).toEqual(['bench', 'db-fly', 'squat', 'stretch']);
  });

  it('matches muscles as primary by default, or any role when asked', () => {
    expect(ids(filterExercises(list, { muscles: ['glutes'] }))).toEqual([]);
    expect(ids(filterExercises(list, { muscles: ['glutes'], muscleRole: 'any' }))).toEqual(['squat']);
    expect(ids(filterExercises(list, { muscles: ['chest', 'quads'] }))).toEqual(['bench', 'db-fly', 'squat']);
  });

  it('ORs within a facet and ANDs across facets', () => {
    expect(ids(filterExercises(list, { equipment: ['barbell', 'dumbbell'], levels: ['beginner', 'expert'] }))).toEqual(['bench', 'squat']);
    expect(ids(filterExercises(list, { categories: ['stretching'] }))).toEqual(['stretch']);
    expect(ids(filterExercises(list, { customOnly: true }))).toEqual(['stretch']);
  });

  it('can restrict to favourites', () => {
    expect(ids(filterExercises(list, { favourites: new Set(['squat', 'nope']) }))).toEqual(['squat']);
  });

  it('treats empty facet arrays as "no filter"', () => {
    expect(filterExercises(list, { muscles: [], equipment: [], levels: [] })).toHaveLength(4);
  });
});

describe('favourites', () => {
  it('toggles immutably', () => {
    const empty: ReadonlySet<string> = new Set();
    const one = toggleFavourite(empty, 'a');
    expect([...one]).toEqual(['a']);
    expect(empty.size).toBe(0);
    expect(toggleFavourite(one, 'a').size).toBe(0);
    expect(isFavourite(one, 'a')).toBe(true);
  });

  it('adds and removes idempotently, returning the same set when nothing changes', () => {
    const set = addFavourite(new Set(), 'a');
    expect(addFavourite(set, 'a')).toBe(set);
    expect(removeFavourite(set, 'b')).toBe(set);
    expect(removeFavourite(set, 'a').size).toBe(0);
  });

  it('prunes ids that no longer exist in the catalog', () => {
    expect([...pruneFavourites(new Set(['a', 'gone', 'b']), ['a', 'b', 'c'])]).toEqual(['a', 'b']);
  });
});
