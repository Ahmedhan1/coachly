import { z } from 'zod';
import type { FoodLineSource } from './foodLines';
import type { FoodCategory } from './recipes';

/** Allergy / intolerance groups the trainer can tick for a client (labels in i18n under nutrition.cal.allergy). */
export const ALLERGENS = ['dairy', 'gluten', 'eggs', 'nuts', 'fish'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const foodPrefsSchema = z.object({
  /** Food-table ids the client does not eat. */
  dislikes: z.array(z.string().min(1).max(64)).max(300),
  allergies: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  /** Prefer cheap everyday foods; costly ones are picked less often. */
  budget: z.boolean(),
  /** Food-table ids the client loves (dishes with them are picked more often). */
  loves: z.array(z.string().min(1).max(64)).max(300),
});
export type FoodPrefs = z.infer<typeof foodPrefsSchema>;

export const EMPTY_PREFS: FoodPrefs = { dislikes: [], allergies: [], budget: false, loves: [] };

/** Reads stored preferences; anything invalid falls back field by field to "no preference". */
export function parseFoodPrefs(raw: unknown): FoodPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_PREFS };
  const src = raw as Record<string, unknown>;
  const out: FoodPrefs = { ...EMPTY_PREFS };
  for (const key of Object.keys(foodPrefsSchema.shape) as (keyof FoodPrefs)[]) {
    const f = foodPrefsSchema.shape[key].safeParse(src[key]);
    if (f.success) (out as Record<string, unknown>)[key] = f.data;
  }
  return out;
}

export const hasPrefs = (p: FoodPrefs) => p.dislikes.length > 0 || p.allergies.length > 0 || p.budget || p.loves.length > 0;

interface Rule {
  categories: readonly FoodCategory[];
  ids: readonly string[];
  /** Whole words (Arabic or English, lower case) for foods the trainer added; two-word phrases allowed. */
  words: readonly string[];
  /** Ids that look like the group but are not (soy milk is not dairy). */
  except: readonly string[];
}

const RULES: Record<Allergen, Rule> = {
  dairy: {
    categories: ['dairy'],
    ids: ['butter', 'ghee', 'whey', 'casein', 'bechamel_pasta', 'pizza_cheese', 'om_ali', 'rice_pudding', 'mahalabia', 'sahlab', 'latte', 'tea_with_milk', 'milk_chocolate', 'ready_protein_shake', 'protein_bar', 'croissant', 'ready_pancake'],
    words: ['جبن', 'جبنة', 'زبادي', 'لبنة', 'قشطة', 'cheese', 'yogurt', 'whey', 'milk'],
    except: ['soy_milk', 'almond_milk'],
  },
  gluten: {
    categories: [],
    ids: [
      'baladi_bread', 'pasta_cooked', 'vermicelli_dry', 'mesh_bread', 'toast_brown', 'freekeh_cooked', 'bulgur_cooked', 'cornflakes', 'shami_bread', 'toast_white',
      'whole_wheat_bread', 'digestive_biscuit', 'pasta_dry', 'couscous_cooked', 'granola', 'flour_white', 'flour_whole', 'semolina', 'barley_cooked', 'bread_crumbs',
      'instant_noodles', 'tortilla', 'pasta_whole_cooked', 'wheat_berries_cooked', 'oats', 'oats_cooked', 'basbousa', 'kunafa', 'baklava', 'om_ali', 'donut', 'plain_cake',
      'chocolate_wafer', 'tea_biscuit', 'cereal_bar', 'koshari', 'feteer', 'hawawshi', 'fatta', 'bechamel_pasta', 'rice_with_vermicelli', 'soy_sauce', 'croissant',
      'ready_pancake', 'crispy_chicken', 'chicken_nuggets', 'pizza_cheese', 'beef_burger_sandwich', 'chicken_burger_sandwich', 'shawarma_chicken_sandwich',
      'shawarma_beef_sandwich', 'hot_dog_sandwich', 'foul_sandwich', 'taameya_sandwich', 'liver_sandwich', 'sausage_sandwich', 'digestive_biscuit',
    ],
    words: ['عيش', 'خبز', 'توست', 'مكرونة', 'دقيق', 'بقسماط', 'قمح', 'شعير', 'برغل', 'فريك', 'شوفان', 'ساندوتش', 'bread', 'breadcrumbs', 'pasta', 'wheat', 'flour', 'toast', 'sandwich', 'barley', 'oat', 'oatmeal', 'bulgur', 'couscous'],
    except: [],
  },
  eggs: {
    categories: ['eggs'],
    ids: ['mayonnaise', 'shakshuka', 'plain_cake', 'ready_pancake', 'donut'],
    words: ['بيض', 'بيضة', 'بيضتين', 'egg'],
    except: [],
  },
  nuts: {
    categories: ['nuts'],
    ids: ['hazelnut_spread', 'kunafa', 'baklava', 'om_ali', 'almond_milk', 'granola'],
    words: ['لوز', 'سوداني', 'عين جمل', 'كاجو', 'فستق', 'بندق', 'مكسرات', 'nut', 'almond', 'peanut', 'cashew', 'pistachio', 'walnut', 'hazelnut'],
    except: ['sesame', 'sunflower_seeds', 'pumpkin_seeds', 'chia', 'flax_seeds', 'coconut_dried', 'coconut_oil', 'nutmeg'],
  },
  fish: {
    categories: ['fish'],
    ids: [],
    words: ['سمك', 'تونة', 'جمبري', 'سلمون', 'سردين', 'رنجة', 'كابوريا', 'كالماري', 'fish', 'tuna', 'shrimp', 'salmon', 'sardine', 'seafood'],
    except: [],
  },
};

/** Never planned, whatever the preferences (no pork, no alcohol). */
const NEVER_WORDS = ['خنزير', 'بيكون', 'pork', 'bacon', 'ham', 'نبيذ', 'بيرة', 'wine', 'beer'];

/** Foods that cost a lot in Egypt; in budget mode dishes built on them are picked less often. */
const COSTLY_IDS: ReadonlySet<string> = new Set([
  'salmon', 'smoked_salmon', 'shrimp', 'crab', 'squid', 'beef_sirloin_grilled', 'lamb', 'veal', 'duck', 'pigeon', 'tuna_fresh', 'sea_bass', 'avocado', 'almonds',
  'cashew', 'pistachio', 'hazelnut', 'walnuts', 'mixed_nuts', 'quinoa_cooked', 'blueberry', 'cherry', 'kiwi', 'casein', 'plant_protein', 'parmesan', 'cheddar',
  'halloumi', 'protein_bar', 'ready_protein_shake', 'chia', 'coconut_oil', 'greek_yogurt', 'cottage_cheese', 'smoked_salmon', 'whey',
]);

type LineLike = Pick<FoodLineSource, 'name' | 'nameEn' | 'category' | 'foodId'>;

/** Arabic attached prefixes ("بالبيض" → "بيض") stripped before comparing words. */
const PREFIXES = ['وبال', 'بال', 'وال', 'ال', 'و', 'ب'];

function wordsOf(l: LineLike): string[] {
  const raw = `${l.name} ${l.nameEn ?? ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    out.push(w);
    for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) out.push(w.slice(p.length));
    // English plurals: eggs → egg, nuts → nut.
    if (/^[a-z]+e?s$/.test(w)) out.push(w.replace(/e?s$/, ''), w.slice(0, -1));
  }
  return out;
}

/** Whole-word match: "أبيض" (white) is not "بيض" (egg) and eggplant is not egg. */
function hasWord(l: LineLike, words: readonly string[]): boolean {
  const list = wordsOf(l);
  const set = new Set(list);
  const joined = ` ${list.join(' ')} `;
  return words.some((w) => (w.includes(' ') ? joined.includes(` ${w} `) : set.has(w)));
}

/** Whether a food belongs to an allergy group (by food id, food group, then name for foods the trainer added). */
export function foodHasAllergen(l: LineLike, a: Allergen): boolean {
  const r = RULES[a];
  if (l.foodId && r.except.includes(l.foodId)) return false;
  if (l.foodId && r.ids.includes(l.foodId)) return true;
  if (l.category && r.categories.includes(l.category)) return true;
  return hasWord(l, r.words);
}

export function allergensOf(l: LineLike): Allergen[] {
  return ALLERGENS.filter((a) => foodHasAllergen(l, a));
}

const isNever = (l: LineLike) => hasWord(l, NEVER_WORDS);

/** Whether one food is off the menu for this client (allergy, dislike, or never allowed). */
export function foodBlocked(l: LineLike, prefs: FoodPrefs): boolean {
  if (isNever(l)) return true;
  if (l.foodId && prefs.dislikes.includes(l.foodId)) return true;
  return prefs.allergies.some((a) => foodHasAllergen(l, a));
}

interface RecipeLike {
  id: string;
  lines: readonly LineLike[];
}

/** Recipes the planner and the swap list must skip for this client. */
export function blockedRecipes(book: readonly RecipeLike[], prefs: FoodPrefs): Set<string> {
  const out = new Set<string>();
  for (const r of book) if (r.lines.some((l) => foodBlocked(l, prefs))) out.add(r.id);
  return out;
}

/** Score nudges for the planner: dishes with a loved food are preferred, costly dishes less so in budget mode. */
export const LOVE_BONUS = 0.3;
export const COSTLY_PENALTY = 0.25;

export function recipeBoosts(book: readonly RecipeLike[], prefs: FoodPrefs): Map<string, number> {
  const out = new Map<string, number>();
  if (prefs.loves.length === 0 && !prefs.budget) return out;
  const loves = new Set(prefs.loves);
  for (const r of book) {
    let b = 0;
    if (r.lines.some((l) => l.foodId !== undefined && loves.has(l.foodId))) b += LOVE_BONUS;
    if (prefs.budget && r.lines.some((l) => l.foodId !== undefined && COSTLY_IDS.has(l.foodId))) b -= COSTLY_PENALTY;
    if (b !== 0) out.set(r.id, b);
  }
  return out;
}

export const isCostly = (foodId: string) => COSTLY_IDS.has(foodId);
