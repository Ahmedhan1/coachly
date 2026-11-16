import { describe, expect, it } from 'vitest';
import { defaultNutritionSettings } from '@/domain/meals';
import { NutritionStore, type KeyValueStore } from './nutritionStore';
import { createTestData } from './testing';

function memoryKv(): KeyValueStore {
  const map = new Map<string, unknown>();
  return { get: async (k) => map.get(k), set: async (k, v) => void map.set(k, v) };
}

describe('NutritionStore', () => {
  it('seeds the starter catalogue exactly once, even when called concurrently', async () => {
    const { repos } = createTestData();
    const store = new NutritionStore(memoryKv(), repos);
    await Promise.all([store.ensureStarter(), store.ensureStarter()]);
    await store.ensureStarter();
    const recipes = await repos.recipes.list();
    expect(recipes.length).toBeGreaterThanOrEqual(30);
    const supplements = await repos.supplements.list();
    expect(supplements).toHaveLength(5);
    expect(supplements.every((s) => s.dose === '' && s.timing === '')).toBe(true);
    expect((await store.getIngredients()).length).toBeGreaterThan(40);
  });

  it('removes only untouched starter recipes, with undo possible', async () => {
    const { repos } = createTestData();
    const store = new NutritionStore(memoryKv(), repos);
    await store.ensureStarter();
    const [kept] = await store.getStarterRecipeIds();
    await store.adoptStarter(kept ?? '');
    const removed = await store.removeStarterRecipes();
    expect(removed).not.toContain(kept);
    expect((await repos.recipes.list()).map((r) => r.id)).toEqual([kept]);
    for (const id of removed) await repos.recipes.restore(id);
    expect((await repos.recipes.list()).length).toBe(removed.length + 1);
  });

  it('stores settings, favourites, client supplements and photo details', async () => {
    const { repos } = createTestData();
    const store = new NutritionStore(memoryKv(), repos);
    expect(await store.getSettings()).toEqual(defaultNutritionSettings());
    await store.saveSettings({ ...defaultNutritionSettings(), targetTolerancePercent: 9 });
    expect((await store.getSettings()).targetTolerancePercent).toBe(9);
    expect((await store.resetSettings()).targetTolerancePercent).toBe(5);
    expect(await store.toggleFavourite('r1')).toBe(true);
    expect(await store.getFavourites()).toEqual(['r1']);
    expect(await store.toggleFavourite('r1')).toBe(false);
    await store.saveClientSupplements('c1', [{ supplementId: 's1', dose: 'زي ما الكوتش قال', timing: '', notes: '' }]);
    expect(await store.getClientSupplements('c1')).toHaveLength(1);
    expect(await store.getClientSupplements('c2')).toEqual([]);
    await store.setEntryPhotos('e1', [{ imageId: 'i1', thumbId: 't1', pose: 'front' }]);
    expect(await store.getEntryPhotos('e1')).toEqual([{ imageId: 'i1', thumbId: 't1', pose: 'front' }]);
    expect(await store.getCalculation('c1')).toBeNull();
  });
});
