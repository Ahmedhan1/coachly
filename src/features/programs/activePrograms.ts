import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { splitClientPrograms, type ActivePrograms } from '@/domain/clientHub';
import type { Program } from '@/domain/models';
import { readActivePrograms } from '@/data/prefs/activePrograms';

export function useActivePrograms(): ActivePrograms | undefined {
  const { meta } = useServices();
  return useLive(() => readActivePrograms(meta), [meta]);
}

/** The client's active program (undefined while loading, null when they have none). */
export function useActiveProgram(clientId: string | null): Program | null | undefined {
  const { meta, data } = useServices();
  return useLive(async () => {
    if (!clientId) return null;
    const [map, programs] = await Promise.all([readActivePrograms(meta), data.repos.programs.listByClient(clientId)]);
    return splitClientPrograms(programs, clientId, map[clientId]).active;
  }, [meta, data, clientId]);
}
