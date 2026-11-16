import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { storedRecipeNutrition } from '@/domain/meals';
import type { ImageId, Ingredient, Recipe } from '@/domain/models';
import { t } from '@/i18n';
import { Icon, IconButton, Num, Sheet, TextArea, TextField } from '@/ui';
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

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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
        <TextField label={t('nutrition.book.servings')} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} ltr />

        <fieldset className={styles.ingredients}>
          <legend className={common.sectionTitle}>{t('nutrition.book.ingredients')}</legend>
          <p className={common.caption}>{t('nutrition.book.ingredientsHint')}</p>
          {rows.map((r, i) => (
            <div key={i} className={styles.ingRow}>
              <div className={styles.ingTop}>
                <TextField label={t('nutrition.book.ingredient')} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} autoComplete="off" />
                <IconButton icon="close" tone="muted" label={t('nutrition.book.removeIngredient', { name: r.name || String(i + 1) })} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))} />
              </div>
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
          <button type="button" className={styles.addRow} onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Icon name="plus" />
            {t('nutrition.book.addIngredient')}
          </button>
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
    </Sheet>
  );
}
