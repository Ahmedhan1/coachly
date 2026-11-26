import { useState } from 'react';
import { RECIPE_CUISINES, type RecipeCuisine } from '@/domain/models';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { searchItems } from '@/data';
import { recipeIconHex } from '@/domain/meals';
import type { Recipe } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Button, Chip, EmptyState, IconButton, ListRow, ListSection, PageHeader, SearchField, SwipeRow } from '@/ui';
import { useRecipesWithNutrition } from '../meals/useRecipeLookup';
import { gramsText, kcalText } from '../shared/numbers';
import { FoodPhotosOffline } from '../shared/FoodPhotosOffline';
import { FoodImage } from '../shared/FoodImage';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { RecipeSheet } from './RecipeSheet';
import { BROWSE_FLAGS, BROWSE_SLOTS, NO_FILTER, isFiltered, matchesFilter, toggleFlag, type RecipeFilter } from './recipeFilters';
import common from '../shared/common.module.css';
import styles from './Recipes.module.css';

/** More → التغذية → كتيّب الوصفات. */
export function RecipesScreen() {
  const ready = useStarterData();
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const recipes = useRecipesWithNutrition();
  const foods = useLive(() => store.getIngredients(), [store, ready]);
  const starter = useLive(() => store.getStarterRecipeIds(), [store]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [filter, setFilter] = useState<RecipeFilter>(NO_FILTER);
  const filtered = (recipes ?? []).filter((r) => matchesFilter(r.recipe, r.perServing, filter));
  const shown = searchItems(filtered, query, (r) => [r.recipe.name, r.recipe.nameEn ?? '', ...r.recipe.tags]);
  const photoStems = [...new Set([...(recipes ?? []).flatMap((r) => (r.recipe.photo ? [r.recipe.photo] : [])), ...(foods ?? []).flatMap((f) => (f.photo ? [f.photo] : []))])];
  const cuisines = RECIPE_CUISINES.filter((c) => (recipes ?? []).some((r) => r.recipe.cuisine === c));
  const chip = (key: string, label: string, pressed: boolean, onClick: () => void) => (
    <Chip key={key} pressed={pressed} onClick={onClick}>
      {label}
    </Chip>
  );
  const starterSet = new Set(starter ?? []);
  const hasStarter = (recipes ?? []).some((r) => starterSet.has(r.recipe.id));

  const remove = async (r: Recipe) => {
    await repos.recipes.softDelete(r.id);
    showToast({ message: t('nutrition.book.deleted', { name: r.name }), actionLabel: t('common.undo'), onAction: () => void repos.recipes.restore(r.id) });
  };
  const removeStarter = async () => {
    const ids = await store.removeStarterRecipes();
    showToast({ message: t('nutrition.book.starterRemoved'), actionLabel: t('common.undo'), onAction: () => void Promise.all(ids.map((id) => repos.recipes.restore(id))) });
  };

  return (
    <>
      <PageHeader
        title={t('nutrition.book.title')}
        back={{ to: '/more/nutrition', label: t('nutrition.book.back') }}
        actions={<IconButton icon="plus" label={t('nutrition.book.add')} onClick={() => setEditing('new')} />}
      />
      {(recipes?.length ?? 0) > 6 && (
        <>
          <div className={styles.search}>
            <SearchField value={query} onChange={setQuery} label={t('nutrition.recipes.search')} placeholder={t('nutrition.recipes.search')} clearLabel={t('common.clearSearch')} />
          </div>
          <div className={styles.filters} role="group" aria-label={t('nutrition.bookBrowse.filters')} data-testid="recipe-filters">
            <div className={styles.chips} role="group" aria-label={t('nutrition.bookBrowse.slot')}>
              {chip('all', t('nutrition.bookBrowse.all'), filter.slot === null, () => setFilter((f) => ({ ...f, slot: null })))}
              {BROWSE_SLOTS.map((slot) => chip(slot, t(`nutrition.bookBrowse.slots.${slot}`), filter.slot === slot, () => setFilter((f) => ({ ...f, slot: f.slot === slot ? null : slot }))))}
            </div>
            <div className={styles.chips} role="group" aria-label={t('nutrition.bookBrowse.more')}>
              {BROWSE_FLAGS.map((flag) =>
                chip(flag, flag === 'quick' ? t('nutrition.bookBrowse.quickShort') : flagLabel(flag), filter.flags.includes(flag), () => setFilter((f) => toggleFlag(f, flag))),
              )}
            </div>
            {cuisines.length > 1 && (
              <div className={styles.chips} role="group" aria-label={t('nutrition.bookBrowse.cuisine')}>
                {cuisines.map((c: RecipeCuisine) => chip(c, t(`nutrition.bookBrowse.cuisines.${c}`), filter.cuisine === c, () => setFilter((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))))}
              </div>
            )}
            {isFiltered(filter) && (
              <div className={styles.filterBar}>
                <span>{t('nutrition.bookBrowse.count', { n: shown.length })}</span>
                <Button variant="plain" icon="close" onClick={() => setFilter(NO_FILTER)}>
                  {t('nutrition.bookBrowse.clear')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      {ready && recipes && recipes.length === 0 && (
        <EmptyState
          icon="utensils"
          title={t('nutrition.book.emptyTitle')}
          body={t('nutrition.book.emptyBody')}
          action={
            <Button icon="plus" onClick={() => setEditing('new')}>
              {t('nutrition.book.add')}
            </Button>
          }
        />
      )}
      {shown.length > 0 && (
        <ListSection count={shown.length}>
          {shown.map(({ recipe, perServing }) => (
            <SwipeRow key={recipe.id} onDelete={() => void remove(recipe)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('nutrition.book.deleteLabel', { name: recipe.name })}>
              <ListRow
                leading={<FoodImage imageId={recipe.imageId} photo={recipe.photo} icon={recipeIconHex(recipe.ingredients, foods ?? [])} className={styles.thumb} />}
                title={pick(recipe.name, recipe.nameEn)}
                subtitle={
                  recipe.prepMin !== undefined
                    ? t('nutrition.bookBrowse.meta', { kcal: kcalText(perServing.kcal), p: gramsText(perServing.proteinG), min: recipe.prepMin })
                    : t('nutrition.bookBrowse.metaNoTime', { kcal: kcalText(perServing.kcal), p: gramsText(perServing.proteinG) })
                }
                onClick={() => setEditing(recipe)}
              />
            </SwipeRow>
          ))}
        </ListSection>
      )}
      {query && shown.length === 0 && <p className={styles.none}>{t('nutrition.recipes.noMatch')}</p>}
      {!query && isFiltered(filter) && shown.length === 0 && <p className={styles.none}>{t('nutrition.bookBrowse.noMatch')}</p>}
      {ready && photoStems.length > 0 && <FoodPhotosOffline stems={photoStems} />}
      {hasStarter && (
        <div className={common.actions}>
          <Button variant="plain" icon="trash" onClick={() => void removeStarter()}>
            {t('nutrition.book.removeStarter')}
          </Button>
        </div>
      )}
      {editing && <RecipeSheet recipe={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function flagLabel(flag: (typeof BROWSE_FLAGS)[number]): string {
  return flag === 'cut' || flag === 'bulk' ? t(`nutrition.bookBrowse.goals.${flag}`) : t(`nutrition.bookBrowse.${flag}`);
}
