import { describe, expect, it } from 'vitest';
import { ExerciseLibraryStore, HIDDEN_EXERCISES_KEY, type BuiltinRef, type KeyValueStore } from './exerciseLibraryStore';
import { createTestData } from './testing';
import { undoLastDelete } from './undo';

function memory(): KeyValueStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return { map, get: async (k) => map.get(k), set: async (k, v) => void map.set(k, v) };
}

const SQUAT: BuiltinRef = {
  id: 'Barbell_Squat',
  defaultNameAr: 'بار سكوات',
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glutes'],
  equipment: 'barbell',
  level: 'beginner',
};

function setup() {
  const data = createTestData();
  const meta = memory();
  return { ...data, meta, store: new ExerciseLibraryStore(data.repos, meta) };
}

describe('ExerciseLibraryStore', () => {
  it('starts with no changes', async () => {
    const { store } = setup();
    const c = await store.changes();
    expect(c.custom).toEqual([]);
    expect(c.overrides).toEqual([]);
    expect(c.favourites.size).toBe(0);
  });

  it('renames a built-in exercise through one override row, and an empty name restores the default', async () => {
    const { store, db } = setup();
    await store.rename(SQUAT.id, SQUAT, 'سكوات بالبار');
    await store.setFavourite(SQUAT.id, SQUAT, true);
    expect(await db.exercises.count()).toBe(1);
    let c = await store.changes();
    expect(c.overrides).toEqual([{ exerciseId: SQUAT.id, nameAr: 'سكوات بالبار', imageIds: [], hidden: false }]);
    expect([...c.favourites]).toEqual([SQUAT.id]);
    await store.rename(SQUAT.id, SQUAT, '  ');
    c = await store.changes();
    expect(c.overrides[0]?.nameAr).toBe('بار سكوات');
  });

  it('keeps an English name next to the Arabic one; an empty English name clears it', async () => {
    const { store, db } = setup();
    await store.rename(SQUAT.id, SQUAT, 'سكوات الكابتن');
    await store.setEnglishName(SQUAT.id, SQUAT, ' Coach Squat ');
    expect(await db.exercises.count()).toBe(1);
    let c = await store.changes();
    expect(c.overrides[0]).toMatchObject({ nameAr: 'سكوات الكابتن', nameEn: 'Coach Squat' });
    await store.setEnglishName(SQUAT.id, SQUAT, '');
    c = await store.changes();
    expect(c.overrides[0]?.nameAr).toBe('سكوات الكابتن');
    expect(c.overrides[0]?.nameEn).toBeUndefined();

    const id = await store.createCustom({ nameAr: 'تمريني', nameEn: 'My Move', primaryMuscles: ['abs'], secondaryMuscles: [], equipment: 'other', level: 'beginner', imageIds: [] });
    c = await store.changes();
    expect(c.custom.find((e) => e.id === id)?.nameEn).toBe('My Move');
  });

  it('creates, favourites and deletes a custom exercise with undo', async () => {
    const { store, db, clock } = setup();
    const id = await store.createCustom({
      nameAr: 'تمريني',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['glutes', 'hamstrings'],
      equipment: 'bands',
      level: 'expert',
      imageIds: ['img1'],
    });
    await store.setFavourite(id, null, true);
    let c = await store.changes();
    expect(c.custom).toEqual([
      { id, nameAr: 'تمريني', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'bands', level: 'expert', imageIds: ['img1'] },
    ]);
    expect(c.favourites.has(id)).toBe(true);
    await store.deleteCustom(id);
    expect((await store.changes()).custom).toEqual([]);
    await undoLastDelete(db, clock);
    c = await store.changes();
    expect(c.custom.map((e) => e.id)).toEqual([id]);
  });

  it('hides and unhides built-ins in the meta store', async () => {
    const { store, meta } = setup();
    await store.setHidden('B', true);
    await store.setHidden('A', true);
    expect(meta.map.get(HIDDEN_EXERCISES_KEY)).toEqual(['A', 'B']);
    expect((await store.changes()).overrides).toEqual([
      { exerciseId: 'A', hidden: true },
      { exerciseId: 'B', hidden: true },
    ]);
    await store.setHidden('A', false);
    expect([...(await store.changes()).hidden]).toEqual(['B']);
  });

  it('stores replacement photos and restores pack photos with an empty list', async () => {
    const { store } = setup();
    await store.setPhotos(SQUAT.id, SQUAT, ['p1']);
    expect((await store.changes()).overrides[0]?.imageIds).toEqual(['p1']);
    await store.setPhotos(SQUAT.id, SQUAT, []);
    expect((await store.changes()).overrides[0]?.imageIds).toEqual([]);
  });
});
