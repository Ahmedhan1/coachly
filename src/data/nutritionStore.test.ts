import { describe, expect, it } from 'vitest';
import { defaultNutritionSettings } from '@/domain/meals';
import { NUTRITION_KEYS, NutritionStore, type KeyValueStore } from './nutritionStore';
import { starterFoodRenames, starterIngredients, starterRecipes } from './seeds/starter';
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

  it('refreshes untouched starter recipes (slots, English, raw/cooked names) and follows renamed foods, but keeps edits', async () => {
    const { repos } = createTestData();
    const kv = memoryKv();
    const all = starterIngredients();
    const chicken = all.find((i) => i.id === 'chicken_breast');
    const renames = starterFoodRenames();
    if (!chicken || !renames.chicken_breast) throw new Error('seed rows missing');
    // An install from data version 2: old food names, recipes without English or slot tags on salads.
    await kv.set(NUTRITION_KEYS.ingredients, [{ id: chicken.id, name: renames.chicken_breast, per100g: chicken.per100g }]);
    await kv.set(NUTRITION_KEYS.starterSeeded, 1);
    await kv.set(NUTRITION_KEYS.foodsVersion, 3);
    await kv.set(NUTRITION_KEYS.recipesVersion, 2);
    const shipped = starterRecipes().filter((r) => r.since <= 2);
    await kv.set(NUTRITION_KEYS.starterRecipeKeys, shipped.map((r) => r.key));
    const salad = shipped.find((r) => r.key === 'baladi_salad');
    const foul = shipped.find((r) => r.key === 'foul');
    if (!salad || !foul) throw new Error('recipes missing');
    const untouched = await repos.recipes.create({ name: salad.name, servings: salad.servings, ingredients: salad.ingredients, instructions: salad.instructions, imageId: null, tags: ['سلطات'] });
    const edited = await repos.recipes.create({ name: 'فول بتاعي', servings: 1, ingredients: foul.ingredients, instructions: 'بطريقتي', imageId: null, tags: ['فطار'] });
    await kv.set(NUTRITION_KEYS.starterRecipes, [untouched.id]);
    const store = new NutritionStore(kv, repos);
    await store.ensureStarter();
    const refreshed = await repos.recipes.get(untouched.id);
    expect(refreshed?.tags).toContain('غدا');
    expect(refreshed?.nameEn).toBe('Egyptian Salad');
    expect((await repos.recipes.get(edited.id))?.instructions).toBe('بطريقتي');
    expect((await repos.recipes.get(edited.id))?.nameEn).toBeUndefined();
    const foods = await store.getIngredients();
    expect(foods.find((f) => f.id === 'chicken_breast')?.name).toBe(chicken.name);
    expect(foods.find((f) => f.id === 'egg')?.unitG).toBe(50);
    expect(foods.find((f) => f.id === 'egg')?.nameEn).toBe('Egg');
    expect((await repos.recipes.list()).length).toBe(2 + starterRecipes().filter((r) => r.since > 2).length);
  });

  it('a data-v3 install gets the new recipes, prep times, cuisines and photos; edited recipes keep their text', async () => {
    const { repos } = createTestData();
    const kv = memoryKv();
    await kv.set(NUTRITION_KEYS.ingredients, starterIngredients().map((f) => ({ ...f, photo: undefined })));
    await kv.set(NUTRITION_KEYS.starterSeeded, 1);
    await kv.set(NUTRITION_KEYS.foodsVersion, 4);
    await kv.set(NUTRITION_KEYS.recipesVersion, 3);
    await kv.set(NUTRITION_KEYS.recipesRefreshed, 3);
    const shipped = starterRecipes().filter((r) => r.since <= 3);
    await kv.set(NUTRITION_KEYS.starterRecipeKeys, shipped.map((r) => r.key));
    const koshari = shipped.find((r) => r.key === 'koshari');
    const foul = shipped.find((r) => r.key === 'foul');
    if (!koshari || !foul) throw new Error('recipes missing');
    const base = (r: typeof foul) => ({ name: r.name, servings: r.servings, ingredients: r.ingredients, instructions: r.instructions, imageId: null, tags: r.tags });
    const untouched = await repos.recipes.create(base(koshari));
    const edited = await repos.recipes.create({ ...base(foul), name: 'فول بتاعي', instructions: 'بطريقتي' });
    await kv.set(NUTRITION_KEYS.starterRecipes, [untouched.id]);
    await kv.set(NUTRITION_KEYS.starterRecipeKeyById, { [untouched.id]: 'koshari', [edited.id]: 'foul' });
    const store = new NutritionStore(kv, repos);
    await store.ensureStarter();
    const k = await repos.recipes.get(untouched.id);
    expect(k?.prepMin).toBe(koshari.prepMin);
    expect(k?.cuisine).toBe('egyptian');
    expect(k?.photo).toBe(starterRecipes().find((r) => r.key === 'koshari')?.photo);
    const e = await repos.recipes.get(edited.id);
    expect(e?.name).toBe('فول بتاعي');
    expect(e?.instructions).toBe('بطريقتي');
    expect(e?.cuisine).toBe('egyptian');
    const fresh = starterRecipes().filter((r) => r.since === 4).length;
    expect(fresh).toBeGreaterThanOrEqual(100);
    expect((await repos.recipes.list()).length).toBe(2 + fresh);
    const foods = await store.getIngredients();
    expect(foods.some((f) => f.id === 'ginger')).toBe(true);
    const shippedPhotos = starterIngredients().filter((f) => f.photo).length;
    expect(foods.filter((f) => f.photo).length).toBe(shippedPhotos);
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
