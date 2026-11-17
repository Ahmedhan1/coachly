import { useMemo } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { prepareSearch, filterPrepared } from '@/data';
import { searchExercises } from '@/domain/exercises';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { exerciseSubline } from '@/features/programs/names';
import { useNutritionStore } from '@/features/nutrition/shared/useNutritionStore';
import { t } from '@/i18n';

export type SearchGroup = 'clients' | 'exercises' | 'programs' | 'recipes' | 'foods';

export interface SearchHit {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  to: string;
}

const PER_GROUP = 5;
export const MIN_QUERY = 2;

/**
 * One search over the trainer's whole app. Each source is read once while the sheet is open and searched in
 * memory with the same Arabic folding as the lists (ة/ه, أ/ا, digits…).
 */
export function useGlobalSearch(query: string, active: boolean): Record<SearchGroup, SearchHit[]> | undefined {
  const repos = useRepos();
  const store = useNutritionStore();
  const catalog = useExerciseCatalog();
  const clients = useLive(() => (active ? repos.clients.list() : Promise.resolve([])), [repos, active]);
  const programs = useLive(() => (active ? repos.programs.list() : Promise.resolve([])), [repos, active]);
  const recipes = useLive(() => (active ? repos.recipes.list() : Promise.resolve([])), [repos, active]);
  const foods = useLive(() => (active ? store.getIngredients() : Promise.resolve([])), [store, active]);

  const prepared = useMemo(() => {
    if (!clients || !programs || !recipes || !foods) return undefined;
    const names = new Map<string, string>(clients.map((c) => [c.id, c.name]));
    return {
      clients: prepareSearch(clients, (c) => [c.name, c.phone]),
      programs: prepareSearch(programs, (p) => [p.name, p.clientId ? (names.get(p.clientId) ?? '') : '']),
      recipes: prepareSearch(recipes, (r) => [r.name, ...r.tags]),
      foods: prepareSearch(foods, (f) => [f.name]),
      names,
    };
  }, [clients, programs, recipes, foods]);

  return useMemo(() => {
    if (!prepared) return undefined;
    const q = query.trim();
    const empty = { clients: [], exercises: [], programs: [], recipes: [], foods: [] };
    if (q.length < MIN_QUERY) return empty;
    return {
      clients: filterPrepared(prepared.clients, q)
        .slice(0, PER_GROUP)
        .map((c) => ({ id: c.id, group: 'clients' as const, title: c.name, subtitle: t(`goals.${c.goal}`), to: `/clients/${c.id}` })),
      exercises: searchExercises(catalog?.list ?? [], q, PER_GROUP).map((e) => ({
        id: e.id,
        group: 'exercises' as const,
        title: e.nameAr,
        subtitle: exerciseSubline(e),
        to: `/exercises/${encodeURIComponent(e.id)}`,
      })),
      programs: filterPrepared(prepared.programs, q)
        .slice(0, PER_GROUP)
        .map((p) => ({
          id: p.id,
          group: 'programs' as const,
          title: p.name,
          subtitle: p.isTemplate ? t('hub.search.template') : p.clientId ? (prepared.names.get(p.clientId) ?? '') : '',
          to: `/programs/${p.id}`,
        })),
      recipes: filterPrepared(prepared.recipes, q)
        .slice(0, PER_GROUP)
        .map((r) => ({ id: r.id, group: 'recipes' as const, title: r.name, subtitle: '', to: '/more/recipes' })),
      foods: filterPrepared(prepared.foods, q)
        .slice(0, PER_GROUP)
        .map((f) => ({ id: f.id, group: 'foods' as const, title: f.name, subtitle: '', to: '/more/foods' })),
    };
  }, [prepared, catalog, query]);
}
