import { useLocation } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client } from '@/domain/models';

/** undefined while loading, null when missing/deleted. */
export function useClient(clientId: string): Client | null | undefined {
  const repos = useRepos();
  return useLive(async () => (await repos.clients.get(clientId)) ?? null, [repos, clientId]);
}

/** Back target: where the trainer came from (hub screens pass `state.from`), else the client screen. */
export function useBackTo(fallback: string): string {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') ? from : fallback;
}
