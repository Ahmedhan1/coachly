import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { foodIconHex, recipeIconHex, storedRecipeNutrition, type Portion } from '@/domain/meals';
import type { ImageId, Ingredient, Recipe } from '@/domain/models';
import type { IngredientEntry } from '@/domain/meals';
import { searchItems } from '@/data';
import { useLive } from '@/app/useLive';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Icon, IconButton, Num, SearchField, Sheet, TextArea, TextField } from '@/ui';
import { FoodImage } from '../shared/FoodImage';
import { fieldText, gramsText, kcalText, parseDecimal } from '../shared/numbers';
import { PhotoField } from '../shared/PhotoField';
import { useNutritionStore } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';
import styles from './Recipes.module.css';

interface Row {
  name: string;
  quantity: string;
  unit: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  /** Set when the row came from the food table: macros follow the grams. */
  per100?: { kcal: number; proteinG: number; carbG: number; fatG: number };
  portions?: Portion[];
}

const r1 = (n: number) => String(Math.round(n * 10) / 10);
function fromTable(name: string, per100: NonNullable<Row['per100']>, grams: number, portions?: Portion[]): Row {
  const k = grams / 100;
  return { name, ...(portions ? { portions } : {}), quantity: String(grams), unit: 'جم', kcal: r1(per100.kcal * k), proteinG: r1(per100.proteinG * k), carbsG: r1(per100.carbG * k), fatG: r1(per100.fatG * k), per100 };
}

const emptyRow = (): Row => ({ name: '', quantity: '', unit: 'جم', kcal: '', proteinG: '', carbsG: '', fatG: '' });
const toRow = (i: Ingredient): Row => ({
  name: i.name,
  quantity: fieldText(i.quantity),
  unit: i.unit,
  kcal: fieldText(i.kcal),
  proteinG: fieldText(i.proteinG),
  carbsG: fieldText(i.carbsG),
  fatG: fieldText(i.fatG),
});
const optional = (s: string): number | null => {
  const n = parseDecimal(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function toIngredients(rows: readonly Row[]): Ingredient[] | null {
  const out: Ingredient[] = [];
  for (const r of rows) {
    if (!r.name.trim()) continue;
    const q = parseDecimal(r.quantity);
    if (!Number.isFinite(q) || q <= 0) return null;
    out.push({ name: r.name.trim(), quantity: q, unit: r.unit.trim() || 'جم', kcal: optional(r.kcal), proteinG: optional(r.proteinG), carbsG: optional(r.carbsG), fatG: optional(r.fatG) });
  }
  return out;
}

/** Recipe editor: ingredients with their own values; per-serving macros update live. */
export function RecipeSheet({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 1));
  const [rows, setRows] = useState<Row[]>(recipe && recipe.ingredients.length > 0 ? recipe.ingredients.map(toRow) : [emptyRow()]);
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [imageId, setImageId] = useState<string | null>(recipe?.imageId ?? null);
  const [error, setError] = useState<string | null>(null);

  const ingredients = toIngredients(rows);
  const servingsN = Math.max(1, Math.round(parseDecimal(servings)) || 1);
  const preview = ingredients ? storedRecipeNutrition({ servings: servingsN, ingredients }) : null;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        // Typing grams on a food-table row recomputes its macros; editing a macro by hand unlinks it.
        if (next.per100 && 'quantity' in patch) {
          const g = parseDecimal(next.quantity);
          return Number.isFinite(g) && g > 0 ? { ...fromTable(next.name, next.per100, g, next.portions), quantity: next.quantity } : next;
        }
        if (['kcal', 'proteinG', 'carbsG', 'fatG', 'unit'].some((k) => k in patch)) delete next.per100;
        return next;
      }),
    );
  const [picking, setPicking] = useState(false);
  const foods = useLive(() => store.getIngredients(), [store]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('nutrition.book.nameRequired'));
    if (!ingredients) return setError(t('nutrition.book.invalid'));
    const body = { name: name.trim(), servings: servingsN, ingredients, instructions: instructions.trim(), imageId: imageId as ImageId | null, tags: recipe?.tags ?? [] };
    if (recipe) {
      await repos.recipes.update(recipe.id, body);
      await store.adoptStarter(recipe.id);
    } else {
      await repos.recipes.create(body);
    }
    showToast({ message: t('nutrition.book.saved'), duration: 2500 });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={recipe ? t('nutrition.book.editTitle') : t('nutrition.book.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form="recipe-form" className={common.sheetSave}>
          {t('common.save')}
        </button>
      }
    >
      <form id="recipe-form" className={common.form} onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label={t('nutrition.book.name')}
          placeholder={t('nutrition.book.namePlaceholder')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          autoComplete="off"
        />
        <div className={styles.hero}>
          <FoodImage imageId={imageId} icon={recipeIconHex(ingredients ?? [], foods ?? [])} className={styles.heroImg} />
        </div>
        <TextField label={t('nutrition.book.servings')} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} ltr />

        <fieldset className={styles.ingredients}>
          <legend className={common.sectionTitle}>{t('nutrition.book.ingredients')}</legend>
          <p className={common.caption}>{t('nutrition.book.ingredientsHint')}</p>
          {rows.map((r, i) => (
            <div key={i} className={styles.ingRow}>
              <div className={styles.ingTop}>
                <FoodImage icon={foodIconHex(foods?.find((f) => f.name === r.name) ?? {})} className={styles.ingIcon} />
                <TextField label={t('nutrition.book.ingredient')} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} autoComplete="off" />
                <IconButton icon="close" tone="muted" label={t('nutrition.book.removeIngredient', { name: r.name || String(i + 1) })} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))} />
              </div>
              {r.portions && r.portions.length > 0 && (
                <div className={styles.portions} role="group" aria-label={t('nutrition.foods.portions')}>
                  {r.portions.map((p) => (
                    <button key={p.label} type="button" className={styles.portion} onClick={() => setRow(i, { quantity: String(p.grams) })}>
                      {p.label} · <bdi className="num">{p.grams}</bdi>
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.ingGrid}>
                <TextField label={t('nutrition.book.quantity')} inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} ltr />
                <TextField label={t('nutrition.book.unit')} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} />
                <TextField label={t('nutrition.book.kcal')} inputMode="decimal" value={r.kcal} onChange={(e) => setRow(i, { kcal: e.target.value })} ltr />
                <TextField label={t('nutrition.book.protein')} inputMode="decimal" value={r.proteinG} onChange={(e) => setRow(i, { proteinG: e.target.value })} ltr />
                <TextField label={t('nutrition.book.carb')} inputMode="decimal" value={r.carbsG} onChange={(e) => setRow(i, { carbsG: e.target.value })} ltr />
                <TextField label={t('nutrition.book.fat')} inputMode="decimal" value={r.fatG} onChange={(e) => setRow(i, { fatG: e.target.value })} ltr />
              </div>
            </div>
          ))}
          <div className={styles.addRows}>
            <button type="button" className={styles.addRow} onClick={() => setPicking(true)}>
              <Icon name="list" />
              {t('nutrition.foods.pick')}
            </button>
            <button type="button" className={styles.addRow} onClick={() => setRows((rs) => [...rs, emptyRow()])}>
              <Icon name="plus" />
              {t('nutrition.book.addIngredient')}
            </button>
          </div>
        </fieldset>

        {preview?.ok && (
          <p className={styles.preview} aria-live="polite">
            {t('nutrition.book.total')}: <Num>{kcalText(preview.value.perServing.kcal)}</Num> {t('nutrition.units.kcal')} · <Num>{gramsText(preview.value.perServing.proteinG)}</Num>{' '}
            {t('nutrition.units.gProtein')}
          </p>
        )}

        <TextArea label={`${t('nutrition.book.instructions')} (${t('common.optional')})`} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <PhotoField label={t('nutrition.book.photo')} addLabel={t('nutrition.book.addPhoto')} removeLabel={t('nutrition.book.removePhoto')} imageId={imageId} onChange={setImageId} />
        {error && (
          <p className={common.error} role="alert">
            {error}
          </p>
        )}
      </form>
      {picking && (
        <FoodPicker
          foods={foods ?? []}
          onClose={() => setPicking(false)}
          onPick={(f) => {
            setPicking(false);
            setRows((rs) => [...rs.filter((r) => r.name.trim() !== ''), fromTable(f.name, f.per100g, 100, f.portions)]);
          }}
        />
      )}
    </Sheet>
  );
}

function FoodPicker({ foods, onClose, onPick }: { foods: IngredientEntry[]; onClose: () => void; onPick: (f: IngredientEntry) => void }) {
  const [query, setQuery] = useState('');
  const shown = searchItems([...foods].sort((a, b) => a.name.localeCompare(b.name, 'ar')), query, (f) => [f.name, f.nameEn ?? '']).slice(0, 80);
  return (
    <Sheet open onClose={onClose} title={t('nutrition.foods.pickTitle')} cancelLabel={t('common.cancel')}>
      <SearchField value={query} onChange={setQuery} label={t('nutrition.foods.search')} placeholder={t('nutrition.foods.search')} clearLabel={t('common.clearSearch')} />
      <ul className={styles.foodList}>
        {shown.map((f) => (
          <li key={f.id}>
            <button type="button" className={styles.foodRow} onClick={() => onPick(f)}>
              <FoodImage imageId={f.imageId} food={f} className={styles.ingIcon} />
              <span className={styles.foodName}>{pick(f.name, f.nameEn)}</span>
              <small>
                <Num>{Math.round(f.per100g.kcal)}</Num> {t('nutrition.units.kcal')} / 100 {t('nutrition.units.g')}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
