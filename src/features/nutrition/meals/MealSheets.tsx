import { useId, useMemo, useState } from 'react';
import { replaceItem, swapCandidates, type MacroTotals } from '@/domain/meals';
import type { Meal, RecipeId } from '@/domain/models';
import { searchItems } from '@/data';
import { t } from '@/i18n';
import { Button, Icon, Num, SearchField, Sheet, TextField } from '@/ui';
import { kcalText, gramsText } from '../shared/numbers';
import type { RecipeWithNutrition } from './useRecipeLookup';
import common from '../shared/common.module.css';
import styles from './MealPlan.module.css';

export type SheetState = { kind: 'add'; mealId: string } | { kind: 'swap'; mealId: string; index: number } | { kind: 'meal'; mealId: string | null };

type MealItem = Meal['items'][number];

const SERVING_STEPS = [0.5, 1, 1.5, 2, 3];

function RecipeChoice({ r, onPick }: { r: RecipeWithNutrition; onPick: () => void }) {
  return (
    <li>
      <button type="button" className={styles.choice} onClick={onPick}>
        <span className={styles.choiceName}>{r.recipe.name}</span>
        <span className={styles.choiceSub}>
          <Num>{kcalText(r.perServing.kcal)}</Num> {t('nutrition.units.kcal')} · <Num>{gramsText(r.perServing.proteinG)}</Num>{' '}
          {t('nutrition.units.gProtein')}
        </span>
      </button>
    </li>
  );
}

export function AddItemSheet({ recipes, onClose, onAdd }: { recipes: RecipeWithNutrition[]; onClose: () => void; onAdd: (item: MealItem) => void }) {
  const [query, setQuery] = useState('');
  const [servings, setServings] = useState(1);
  const [text, setText] = useState('');
  const groupId = useId();
  const shown = useMemo(() => searchItems(recipes, query, (r) => [r.recipe.name, ...r.recipe.tags]), [recipes, query]);
  return (
    <Sheet open onClose={onClose} title={t('nutrition.plan.addItemTitle')} cancelLabel={t('common.cancel')}>
      <div className={common.form}>
        <div role="radiogroup" aria-labelledby={groupId} className={styles.servings}>
          <span id={groupId} className={common.caption}>
            {t('nutrition.plan.servings')}
          </span>
          <div className={common.chips}>
            {SERVING_STEPS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={servings === s} aria-pressed={servings === s} className={common.chip} onClick={() => setServings(s)}>
                <Num>{s}</Num>
              </button>
            ))}
          </div>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder={t('nutrition.recipes.search')} label={t('nutrition.recipes.search')} clearLabel={t('common.clearSearch')} />
        <ul className={styles.choices}>
          {shown.map((r) => (
            <RecipeChoice key={r.recipe.id} r={r} onPick={() => onAdd({ recipeId: r.recipe.id as RecipeId, text: '', servings })} />
          ))}
        </ul>
        {shown.length === 0 && <p className={common.muted}>{t('nutrition.recipes.noMatch')}</p>}
        <div className={styles.freeText}>
          <TextField label={t('nutrition.plan.freeText')} hint={t('nutrition.plan.freeTextHint')} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="secondary" disabled={!text.trim()} onClick={() => onAdd({ recipeId: null, text: text.trim(), servings })}>
            {t('common.add')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

interface SwapSheetProps {
  recipes: RecipeWithNutrition[];
  meal: Meal | undefined;
  index: number;
  lookup: ReadonlyMap<string, MacroTotals>;
  onClose: () => void;
  onSwap: (apply: (meals: Meal[]) => Meal[]) => void;
}

/** Offers recipes with the closest calories per serving, so a swap keeps the day near its target. */
export function SwapSheet({ recipes, meal, index, lookup, onClose, onSwap }: SwapSheetProps) {
  const item = meal?.items[index];
  const current = item?.recipeId ? lookup.get(item.recipeId) : undefined;
  const byId = useMemo(() => new Map(recipes.map((r) => [r.recipe.id, r])), [recipes]);
  const candidates = useMemo(
    () =>
      swapCandidates(
        recipes.map((r) => ({ recipeId: r.recipe.id, perServing: r.perServing })),
        current?.kcal ?? 0,
        item?.recipeId ?? null,
      ),
    [recipes, current, item],
  );
  if (!meal || !item) return null;
  return (
    <Sheet open onClose={onClose} title={t('nutrition.plan.swapTitle')} cancelLabel={t('common.cancel')}>
      <p className={common.muted}>{t('nutrition.plan.swapHint', { kcal: kcalText(current?.kcal ?? 0) })}</p>
      <ul className={styles.choices}>
        {candidates.map((c) => {
          const r = byId.get(c.recipeId as RecipeId);
          return r ? (
            <RecipeChoice
              key={c.recipeId}
              r={r}
              onPick={() => onSwap((meals) => replaceItem<Meal['items'][number], Meal>(meals, meal.id, index, { ...item, recipeId: c.recipeId as RecipeId, text: '' }))}
            />
          ) : null;
        })}
      </ul>
    </Sheet>
  );
}

export function MealSheet({ meal, onClose, onSave }: { meal: Meal | undefined; onClose: () => void; onSave: (name: string, time: string | null) => void }) {
  const [name, setName] = useState(meal?.name ?? '');
  const [time, setTime] = useState(meal?.time ?? '');
  const formId = useId();
  return (
    <Sheet
      open
      onClose={onClose}
      title={meal ? t('nutrition.plan.editMealTitle') : t('nutrition.plan.addMeal')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form={formId} className={common.sheetSave} disabled={!name.trim()}>
          {t('common.save')}
        </button>
      }
    >
      <form
        id={formId}
        className={common.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), /^\d{2}:\d{2}$/.test(time) ? time : null);
        }}
      >
        <TextField label={t('nutrition.plan.mealName')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('nutrition.plan.mealNamePlaceholder')} />
        <TextField label={t('nutrition.plan.mealTime')} hint={t('common.optional')} type="time" ltr value={time} onChange={(e) => setTime(e.target.value)} />
        <Icon name="clock" className="visually-hidden" />
      </form>
    </Sheet>
  );
}
