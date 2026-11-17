import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { searchItems } from '@/data';
import { recipeIconHex } from '@/domain/meals';
import type { Recipe } from '@/domain/models';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Badge, Button, EmptyState, IconButton, ListRow, ListSection, PageHeader, SearchField, SwipeRow } from '@/ui';
import { useRecipesWithNutrition } from '../meals/useRecipeLookup';
import { kcalText } from '../shared/numbers';
import { FoodImage } from '../shared/FoodImage';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { RecipeSheet } from './RecipeSheet';
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
  const shown = searchItems(recipes ?? [], query, (r) => [r.recipe.name, r.recipe.nameEn ?? '', ...r.recipe.tags]);
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
        <div className={styles.search}>
          <SearchField value={query} onChange={setQuery} label={t('nutrition.recipes.search')} placeholder={t('nutrition.recipes.search')} clearLabel={t('common.clearSearch')} />
        </div>
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
                leading={<FoodImage imageId={recipe.imageId} icon={recipeIconHex(recipe.ingredients, foods ?? [])} className={styles.thumb} />}
                title={pick(recipe.name, recipe.nameEn)}
                subtitle={t('nutrition.book.perServing', { kcal: kcalText(perServing.kcal) })}
                trailing={starterSet.has(recipe.id) ? <Badge>{t('nutrition.book.starter')}</Badge> : undefined}
                onClick={() => setEditing(recipe)}
              />
            </SwipeRow>
          ))}
        </ListSection>
      )}
      {query && shown.length === 0 && <p className={styles.none}>{t('nutrition.recipes.noMatch')}</p>}
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
