import { useMemo } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { storedRecipeNutrition, type MacroTotals } from '@/domain/meals';
import type { Recipe } from '@/domain/models';

export interface RecipeWithNutrition {
  recipe: Recipe;
  perServing: MacroTotals;
}

/** Live recipes with per-serving macros (computed, never stored), sorted by name. */
export function useRecipesWithNutrition(): RecipeWithNutrition[] | undefined {
  const repos = useRepos();
  const recipes = useLive(() => repos.recipes.list(), [repos]);
  return useMemo(() => {
    if (!recipes) return undefined;
    const collator = new Intl.Collator('ar');
    return recipes
      .map((recipe) => {
        const n = storedRecipeNutrition(recipe);
        return { recipe, perServing: n.ok ? n.value.perServing : { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 } };
      })
      .sort((a, b) => collator.compare(a.recipe.name, b.recipe.name));
  }, [recipes]);
}
