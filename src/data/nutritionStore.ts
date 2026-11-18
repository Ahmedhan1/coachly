import { z } from 'zod';
import {
  defaultDietSettings,
  defaultNutritionSettings,
  parseDietSettings,
  ingredientEntrySchema,
  parseNutritionSettings,
  parseSavedCalculation,
  type DietSettings,
  type IngredientEntry,
  type NutritionSettings,
  type SavedCalculation,
} from '@/domain/meals';
import { DEFAULT_CURRENCY } from '@/domain/models';
import type { Repositories } from './repositories';
import { STARTER_FOOD_VERSION, STARTER_RECIPE_VERSION, starterFoodRenames, starterIngredients, starterRecipes, starterSupplements, type StarterRecipe } from './seeds/starter';

/**
 * Nutrition, supplements and progress data that has no column in the entity tables lives in the `meta`
 * key/value table (no schema change; included in backups). Keys are namespaced below.
 */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const NUTRITION_KEYS = {
  settings: 'nutrition.settings',
  dietSettings: 'nutrition.dietSettings',
  foodsVersion: 'nutrition.foodsVersion',
  recipesVersion: 'nutrition.recipesVersion',
  starterRecipeKeys: 'nutrition.starterRecipeKeys',
  /** Starter recipe id → shipped key, so later data versions can refresh untouched starter recipes. */
  starterRecipeKeyById: 'nutrition.starterRecipeKeyById',
  /** Data version whose tags / English / steps were last applied to untouched starter recipes. */
  recipesRefreshed: 'nutrition.recipesRefreshedVersion',
  ingredients: 'nutrition.ingredients',
  removedIngredients: 'nutrition.removedIngredients',
  favourites: 'nutrition.favouriteRecipes',
  starterSeeded: 'nutrition.starterSeededAt',
  starterRecipes: 'nutrition.starterRecipeIds',
  starterSupplements: 'nutrition.starterSupplementIds',
  calculation: (clientId: string) => `nutrition.calc.${clientId}`,
  clientSupplements: (clientId: string) => `supplements.client.${clientId}`,
  entryPhotos: (entryId: string) => `progress.photos.${entryId}`,
} as const;

export const clientSupplementSchema = z.object({
  supplementId: z.string().min(1),
  dose: z.string().max(200),
  timing: z.string().max(200),
  notes: z.string().max(2000),
});
export type ClientSupplement = z.infer<typeof clientSupplementSchema>;

export const photoPoseSchema = z.enum(['front', 'side', 'back']);
export type PhotoPose = z.infer<typeof photoPoseSchema>;
export const entryPhotoSchema = z.object({ imageId: z.string().min(1), thumbId: z.string().min(1), pose: photoPoseSchema });
export type EntryPhoto = z.infer<typeof entryPhotoSchema>;

const idList = z.array(z.string());
const keyById = z.record(z.string(), z.string());

/** The stored fields of a starter recipe (English name and steps only when shipped). */
function starterRecipeFields(r: StarterRecipe) {
  return {
    name: r.name,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    servings: r.servings,
    ingredients: r.ingredients,
    instructions: r.instructions,
    ...(r.instructionsEn ? { instructionsEn: r.instructionsEn } : {}),
    tags: r.tags,
    ...(r.prepMin !== undefined ? { prepMin: r.prepMin } : {}),
    ...(r.cuisine ? { cuisine: r.cuisine } : {}),
    ...(r.photo ? { photo: r.photo } : {}),
  };
}

/** Facts an edited starter recipe may still lack (photo, prep time, cuisine): filled in, never overwritten. */
function missingFacts(stored: { photo?: string | undefined; prepMin?: number | undefined; cuisine?: string | undefined }, r: StarterRecipe) {
  return {
    ...(stored.photo === undefined && r.photo ? { photo: r.photo } : {}),
    ...(stored.prepMin === undefined && r.prepMin !== undefined ? { prepMin: r.prepMin } : {}),
    ...(stored.cuisine === undefined && r.cuisine ? { cuisine: r.cuisine } : {}),
  };
}

const samePortions = (a: readonly { label: string; grams: number }[], b: readonly { label: string; grams: number }[]) =>
  a.length === b.length && a.every((p, i) => p.label === b[i]?.label && p.grams === b[i]?.grams);

function parseOr<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  const r = schema.safeParse(raw);
  return r.success ? r.data : fallback;
}

const seeding = new WeakMap<KeyValueStore, Promise<void>>();

export class NutritionStore {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly repos: Repositories,
  ) {}

  // ---------- coefficients ----------
  async getSettings(): Promise<NutritionSettings> {
    return parseNutritionSettings(await this.kv.get(NUTRITION_KEYS.settings));
  }
  async saveSettings(settings: NutritionSettings): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.settings, parseNutritionSettings(settings));
  }
  async resetSettings(): Promise<NutritionSettings> {
    const d = defaultNutritionSettings();
    await this.kv.set(NUTRITION_KEYS.settings, d);
    return d;
  }

  // ---------- diet planner coefficients ----------
  async getDietSettings(): Promise<DietSettings> {
    return parseDietSettings(await this.kv.get(NUTRITION_KEYS.dietSettings));
  }
  async saveDietSettings(settings: DietSettings): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.dietSettings, parseDietSettings(settings));
  }
  async resetDietSettings(): Promise<DietSettings> {
    const d = defaultDietSettings();
    await this.kv.set(NUTRITION_KEYS.dietSettings, d);
    return d;
  }

  // ---------- calculator result per client ----------
  async getCalculation(clientId: string): Promise<SavedCalculation | null> {
    return parseSavedCalculation(await this.kv.get(NUTRITION_KEYS.calculation(clientId)));
  }
  async saveCalculation(clientId: string, calc: SavedCalculation): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.calculation(clientId), calc);
  }

  // ---------- ingredient table ----------
  async getIngredients(): Promise<IngredientEntry[]> {
    const raw = await this.kv.get(NUTRITION_KEYS.ingredients);
    return raw === undefined ? [] : parseOr(z.array(ingredientEntrySchema), raw, []);
  }
  async saveIngredients(list: IngredientEntry[]): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.ingredients, z.array(ingredientEntrySchema).parse(list));
  }

  // ---------- favourites + starter bookkeeping ----------
  async getFavourites(): Promise<string[]> {
    return parseOr(idList, await this.kv.get(NUTRITION_KEYS.favourites), []);
  }
  async toggleFavourite(recipeId: string): Promise<boolean> {
    const list = await this.getFavourites();
    const on = !list.includes(recipeId);
    await this.kv.set(NUTRITION_KEYS.favourites, on ? [...list, recipeId] : list.filter((id) => id !== recipeId));
    return on;
  }
  async getStarterRecipeIds(): Promise<string[]> {
    return parseOr(idList, await this.kv.get(NUTRITION_KEYS.starterRecipes), []);
  }
  async getStarterSupplementIds(): Promise<string[]> {
    return parseOr(idList, await this.kv.get(NUTRITION_KEYS.starterSupplements), []);
  }
  /** An edited starter item becomes the trainer's own and is kept by "remove starter items". */
  async adoptStarter(id: string): Promise<void> {
    for (const key of [NUTRITION_KEYS.starterRecipes, NUTRITION_KEYS.starterSupplements]) {
      const list = parseOr(idList, await this.kv.get(key), []);
      if (list.includes(id)) await this.kv.set(key, list.filter((x) => x !== id));
    }
  }
  /** Soft-deletes the untouched starter recipes; returns their ids for undo. */
  async removeStarterRecipes(): Promise<string[]> {
    const removed: string[] = [];
    for (const id of await this.getStarterRecipeIds()) {
      if (await this.repos.recipes.get(id)) {
        await this.repos.recipes.softDelete(id);
        removed.push(id);
      }
    }
    return removed;
  }
  async removeStarterSupplements(): Promise<string[]> {
    const removed: string[] = [];
    for (const id of await this.getStarterSupplementIds()) {
      if (await this.repos.supplements.get(id)) {
        await this.repos.supplements.softDelete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  /** Inserts the starter ingredient table, recipes and supplements once per database. Safe to call often. */
  ensureStarter(): Promise<void> {
    const pending = seeding.get(this.kv);
    if (pending) return pending;
    const run = this.seedOnce().catch((error: unknown) => {
      seeding.delete(this.kv);
      throw error;
    });
    seeding.set(this.kv, run);
    return run;
  }

  /**
   * Brings an existing install up to the shipped food table: adds rows it does not have yet (by id, except ones
   * the trainer deleted) and fills in category, fibre, household measures and illustration on shipped rows that
   * lack them. Anything the trainer typed (names, values, their own photo) is never overwritten. Runs once per
   * data version.
   */
  private async mergeNewIngredients(): Promise<void> {
    const raw = await this.kv.get(NUTRITION_KEYS.ingredients);
    if (raw === undefined) return;
    if ((await this.kv.get(NUTRITION_KEYS.foodsVersion)) === STARTER_FOOD_VERSION) return;
    const current = await this.getIngredients();
    const shipped = new Map(starterIngredients().map((i) => [i.id, i]));
    const ids = new Set(current.map((i) => i.id));
    const removed = new Set(parseOr(idList, await this.kv.get(NUTRITION_KEYS.removedIngredients), []));
    const renames = starterFoodRenames();
    const enriched = current.map((row) => {
      const fresh = shipped.get(row.id);
      if (!fresh) return row;
      const per100g = { ...row.per100g };
      if (per100g.fiberG === undefined && fresh.per100g.fiberG !== undefined) per100g.fiberG = fresh.per100g.fiberG;
      // Portions the trainer never changed take the shipped ones (they now carry English labels).
      const portions = row.portions === undefined || (fresh.portions !== undefined && samePortions(row.portions, fresh.portions)) ? fresh.portions : row.portions;
      return {
        ...row,
        // A shipped name that changed (e.g. now says "raw") follows only if the trainer kept the old one.
        ...(renames[row.id] !== undefined && row.name === renames[row.id] ? { name: fresh.name } : {}),
        per100g,
        ...(row.nameEn === undefined && fresh.nameEn !== undefined ? { nameEn: fresh.nameEn } : {}),
        ...(row.category === undefined && fresh.category !== undefined ? { category: fresh.category } : {}),
        ...(portions !== undefined ? { portions } : {}),
        ...(row.icon === undefined && fresh.icon !== undefined ? { icon: fresh.icon } : {}),
        ...(row.photo === undefined && fresh.photo !== undefined ? { photo: fresh.photo } : {}),
        ...(row.unitG === undefined && fresh.unitG !== undefined ? { unitG: fresh.unitG, ...(fresh.unitHalf ? { unitHalf: true } : {}) } : {}),
      };
    });
    const missing = [...shipped.values()].filter((i) => !ids.has(i.id) && !removed.has(i.id));
    await this.saveIngredients([...enriched, ...missing]);
    await this.kv.set(NUTRITION_KEYS.foodsVersion, STARTER_FOOD_VERSION);
  }

  /**
   * Adds starter recipes that a newer data version ships. Installs from before this bookkeeping existed are taken
   * to have the original recipes (those without a `since`), so nothing the trainer deleted comes back; a recipe
   * the trainer deleted later is remembered by key and is not added again.
   */
  private async mergeNewRecipes(): Promise<void> {
    if ((await this.kv.get(NUTRITION_KEYS.recipesVersion)) === STARTER_RECIPE_VERSION) return;
    const all = starterRecipes();
    const known = new Set(parseOr(idList, await this.kv.get(NUTRITION_KEYS.starterRecipeKeys), all.filter((r) => r.since <= 1).map((r) => r.key)));
    const ids = await this.getStarterRecipeIds();
    const keys = parseOr(keyById, await this.kv.get(NUTRITION_KEYS.starterRecipeKeyById), {});
    await this.refreshStarterRecipes(all, ids, keys);
    for (const r of all) {
      if (known.has(r.key)) continue;
      const created = await this.repos.recipes.create({ ...starterRecipeFields(r), imageId: null });
      ids.push(created.id);
      keys[created.id] = r.key;
      known.add(r.key);
    }
    await this.kv.set(NUTRITION_KEYS.starterRecipes, ids);
    await this.kv.set(NUTRITION_KEYS.starterRecipeKeyById, keys);
    await this.kv.set(NUTRITION_KEYS.starterRecipeKeys, [...known]);
    await this.kv.set(NUTRITION_KEYS.recipesVersion, STARTER_RECIPE_VERSION);
  }

  /**
   * Brings untouched starter recipes (still listed as starter, i.e. never edited) up to the shipped data: meal
   * slot tags, English name and steps, ingredient names, photo, prep time, cuisine. Older installs have no id → key
   * map, so recipes are matched by their (unique) shipped name. Edited recipes are the trainer's own: only a
   * missing photo / prep time / cuisine is filled in, nothing they typed changes.
   */
  private async refreshStarterRecipes(all: readonly StarterRecipe[], ids: readonly string[], keys: Record<string, string>): Promise<void> {
    if ((await this.kv.get(NUTRITION_KEYS.recipesRefreshed)) === STARTER_RECIPE_VERSION) return;
    const byKey = new Map(all.map((r) => [r.key, r]));
    const byName = new Map(all.map((r) => [r.name, r]));
    for (const id of ids) {
      const stored = await this.repos.recipes.get(id);
      if (!stored) continue;
      const shipped = (keys[id] !== undefined ? byKey.get(keys[id]) : undefined) ?? byName.get(stored.name);
      if (!shipped) continue;
      keys[id] = shipped.key;
      await this.repos.recipes.update(id, starterRecipeFields(shipped));
    }
    const untouched = new Set(ids);
    for (const [id, key] of Object.entries(keys)) {
      if (untouched.has(id)) continue;
      const shipped = byKey.get(key);
      const stored = shipped ? await this.repos.recipes.get(id) : undefined;
      if (!shipped || !stored) continue;
      const facts = missingFacts(stored, shipped);
      if (Object.keys(facts).length > 0) await this.repos.recipes.update(id, facts);
    }
    await this.kv.set(NUTRITION_KEYS.recipesRefreshed, STARTER_RECIPE_VERSION);
  }

  /** Remembers a starter row the trainer deleted, so a later app version does not bring it back. */
  async forgetIngredient(id: string): Promise<void> {
    const removed = parseOr(idList, await this.kv.get(NUTRITION_KEYS.removedIngredients), []);
    if (!removed.includes(id)) await this.kv.set(NUTRITION_KEYS.removedIngredients, [...removed, id]);
  }

  private async seedOnce(): Promise<void> {
    if (await this.kv.get(NUTRITION_KEYS.starterSeeded)) {
      await this.mergeNewIngredients();
      await this.mergeNewRecipes();
      return;
    }
    const table = starterIngredients();
    if ((await this.kv.get(NUTRITION_KEYS.ingredients)) === undefined) await this.saveIngredients(table);
    // Supplements first: a handful of rows, so the catalog is usable before the long recipe list is in.
    const settings = await this.repos.settings.get();
    const supplementIds: string[] = [];
    for (const s of starterSupplements()) {
      const created = await this.repos.supplements.create({
        name: s.name,
        imageId: null,
        priceMinor: null,
        currency: settings.currency || DEFAULT_CURRENCY,
        dose: '',
        timing: '',
        notes: '',
      });
      supplementIds.push(created.id);
    }
    const recipeIds: string[] = [];
    const recipeKeys: string[] = [];
    const keyMap: Record<string, string> = {};
    for (const r of starterRecipes(table)) {
      const created = await this.repos.recipes.create({ ...starterRecipeFields(r), imageId: null });
      recipeIds.push(created.id);
      recipeKeys.push(r.key);
      keyMap[created.id] = r.key;
    }
    await this.kv.set(NUTRITION_KEYS.starterRecipes, recipeIds);
    await this.kv.set(NUTRITION_KEYS.starterRecipeKeys, recipeKeys);
    await this.kv.set(NUTRITION_KEYS.starterRecipeKeyById, keyMap);
    await this.kv.set(NUTRITION_KEYS.recipesVersion, STARTER_RECIPE_VERSION);
    await this.kv.set(NUTRITION_KEYS.recipesRefreshed, STARTER_RECIPE_VERSION);
    await this.kv.set(NUTRITION_KEYS.foodsVersion, STARTER_FOOD_VERSION);
    await this.kv.set(NUTRITION_KEYS.starterSupplements, supplementIds);
    await this.kv.set(NUTRITION_KEYS.starterSeeded, Date.now());
  }

  // ---------- supplements assigned to a client (trainer's own dose/timing text) ----------
  async getClientSupplements(clientId: string): Promise<ClientSupplement[]> {
    return parseOr(z.array(clientSupplementSchema), await this.kv.get(NUTRITION_KEYS.clientSupplements(clientId)), []);
  }
  async saveClientSupplements(clientId: string, list: ClientSupplement[]): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.clientSupplements(clientId), z.array(clientSupplementSchema).parse(list));
  }

  // ---------- progress photo details (pose + thumbnail) ----------
  async getEntryPhotos(entryId: string): Promise<EntryPhoto[]> {
    return parseOr(z.array(entryPhotoSchema), await this.kv.get(NUTRITION_KEYS.entryPhotos(entryId)), []);
  }
  async setEntryPhotos(entryId: string, photos: EntryPhoto[]): Promise<void> {
    await this.kv.set(NUTRITION_KEYS.entryPhotos(entryId), z.array(entryPhotoSchema).parse(photos));
  }
}
