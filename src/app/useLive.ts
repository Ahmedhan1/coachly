import { useLiveQuery } from 'dexie-react-hooks';

/**
 * Re-runs a repository query whenever the underlying tables change.
 * Screens call repositories inside `query`; they never touch Dexie tables directly.
 * Returns undefined while the first result is loading.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  return useLiveQuery(query, deps);
}
