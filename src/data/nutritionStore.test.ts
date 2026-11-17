import { describe, expect, it } from 'vitest';
import { defaultNutritionSettings } from '@/domain/meals';
import { NUTRITION_KEYS, NutritionStore, type KeyValueStore } from './nutritionStore';
import { starterIngredients, starterRecipes } from './seeds/starter';
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

  describe('upgrading an install that has the older, smaller food table and recipe book', () => {
    async function legacyInstall() {
      const { repos } = createTestData();
      const kv = memoryKv();
      const all = starterIngredients();
      const rice = all.find((i) => i.id === 'rice_cooked');
      const egg = all.find((i) => i.id === 'egg');
      if (!rice || !egg) throw new Error('seed rows missing');
      // what the first release stored: no category / fibre / portions / icon, and one row the trainer edited
      const legacyRow = (i: typeof rice) => ({ id: i.id, name: i.name, per100g: { kcal: i.per100g.kcal, proteinG: i.per100g.proteinG, carbG: i.per100g.carbG, fatG: i.per100g.fatG } });
      await kv.set(NUTRITION_KEYS.ingredients, [{ ...legacyRow(rice), name: 'رز بتاعي', per100g: { kcal: 999, proteinG: 1, carbG: 1, fatG: 1 } }, legacyRow(egg)]);
      await kv.set(NUTRITION_KEYS.starterSeeded, 1);
      const originals = starterRecipes().filter((r) => r.since <= 1);
      const ids: string[] = [];
      for (const r of originals.slice(0, 10)) ids.push((await repos.recipes.create({ name: r.name, servings: r.servings, ingredients: r.ingredients, instructions: r.instructions, imageId: null, tags: r.tags })).id);
      await kv.set(NUTRITION_KEYS.starterRecipes, ids);
      return { repos, kv, store: new NutritionStore(kv, repos), originals };
    }

    it('adds the new foods, keeps edits, and only fills in the missing details', async () => {
      const { store, kv } = await legacyInstall();
      await store.forgetIngredient('basbousa');
      await store.ensureStarter();
      const foods = await store.getIngredients();
      expect(foods.length).toBeGreaterThanOrEqual(250);
      const rice = foods.find((f) => f.id === 'rice_cooked');
      expect(rice?.name).toBe('رز بتاعي');
      expect(rice?.per100g.kcal).toBe(999);
      expect(rice?.category).toBe('grains');
      expect(rice?.per100g.fiberG).toBeDefined();
      expect(rice?.portions?.length).toBeGreaterThan(0);
      expect(rice?.icon).toBeDefined();
      expect(foods.some((f) => f.id === 'basbousa')).toBe(false);
      expect(await kv.get(NUTRITION_KEYS.foodsVersion)).toBeDefined();
    });

    it('adds only the new starter recipes (once) and does not bring back original ones', async () => {
      const { store, repos, originals, kv } = await legacyInstall();
      await store.ensureStarter();
      const first = (await repos.recipes.list()).length;
      const fresh = starterRecipes().filter((r) => r.since > 1).length;
      expect(first).toBe(10 + fresh);
      expect(fresh).toBeGreaterThanOrEqual(60);
      expect(originals.length).toBeGreaterThan(10);
      const again = new NutritionStore(kv, repos);
      await again.ensureStarter();
      expect((await repos.recipes.list()).length).toBe(first);
      expect((await store.getStarterRecipeIds()).length).toBe(first);
    });
  });

  it('stores diet settings with safe fallbacks', async () => {
    const { repos } = createTestData();
    const store = new NutritionStore(memoryKv(), repos);
    expect((await store.getDietSettings()).kcalTolerancePercent).toBe(5);
    await store.saveDietSettings({ ...(await store.getDietSettings()), highProteinPerKg: 2.5 });
    expect((await store.getDietSettings()).highProteinPerKg).toBe(2.5);
    expect((await store.resetDietSettings()).highProteinPerKg).not.toBe(2.5);
  });
});
