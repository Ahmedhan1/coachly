import { z } from 'zod';
import {
  defaultNutritionSettings,
  ingredientEntrySchema,
  parseNutritionSettings,
  parseSavedCalculation,
  type IngredientEntry,
  type NutritionSettings,
  type SavedCalculation,
} from '@/domain/meals';
import { DEFAULT_CURRENCY } from '@/domain/models';
import type { Repositories } from './repositories';
import { starterIngredients, starterRecipes, starterSupplements } from './seeds/starter';

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

  /** Adds food-table rows that newer app versions ship (by id), never touching rows the trainer has. */
  private async mergeNewIngredients(): Promise<void> {
    const raw = await this.kv.get(NUTRITION_KEYS.ingredients);
    if (raw === undefined) return;
    const current = await this.getIngredients();
    const ids = new Set(current.map((i) => i.id));
    const removed = new Set(parseOr(idList, await this.kv.get(NUTRITION_KEYS.removedIngredients), []));
    const missing = starterIngredients().filter((i) => !ids.has(i.id) && !removed.has(i.id));
    if (missing.length > 0) await this.saveIngredients([...current, ...missing]);
  }

  /** Remembers a starter row the trainer deleted, so a later app version does not bring it back. */
  async forgetIngredient(id: string): Promise<void> {
    const removed = parseOr(idList, await this.kv.get(NUTRITION_KEYS.removedIngredients), []);
    if (!removed.includes(id)) await this.kv.set(NUTRITION_KEYS.removedIngredients, [...removed, id]);
  }

  private async seedOnce(): Promise<void> {
    if (await this.kv.get(NUTRITION_KEYS.starterSeeded)) return this.mergeNewIngredients();
    const table = starterIngredients();
    if ((await this.kv.get(NUTRITION_KEYS.ingredients)) === undefined) await this.saveIngredients(table);
    const recipeIds: string[] = [];
    for (const r of starterRecipes(table)) {
      const created = await this.repos.recipes.create({
        name: r.name,
        servings: r.servings,
        ingredients: r.ingredients,
        instructions: r.instructions,
        imageId: null,
        tags: r.tags,
      });
      recipeIds.push(created.id);
    }
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
    await this.kv.set(NUTRITION_KEYS.starterRecipes, recipeIds);
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
