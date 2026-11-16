import { useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { NutritionStore } from '@/data/nutritionStore';

/** The meta-backed nutrition/supplement/progress store, one per services instance. */
export function useNutritionStore(): NutritionStore {
  const { meta, data } = useServices();
  return useMemo(() => new NutritionStore(meta, data.repos), [meta, data]);
}

/** Seeds the starter recipes, ingredients and supplements on first use. Returns true once ready. */
export function useStarterData(): boolean {
  const store = useNutritionStore();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    store
      .ensureStarter()
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [store]);
  return ready;
}
