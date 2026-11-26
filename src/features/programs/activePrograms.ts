import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { parseActivePrograms, setActiveProgram, splitClientPrograms, type ActivePrograms } from '@/domain/clientHub';
import type { Program } from '@/domain/models';
import type { MetaStore } from '@/services/meta/metaStore';

/** Meta key (inside backups): the program the trainer marked active per client. */
export const ACTIVE_PROGRAMS_KEY = 'programs.activeByClient';

export async function readActivePrograms(meta: MetaStore): Promise<ActivePrograms> {
  return parseActivePrograms(await meta.get(ACTIVE_PROGRAMS_KEY));
}

export async function markActiveProgram(meta: MetaStore, clientId: string, programId: string | null): Promise<void> {
  await meta.set(ACTIVE_PROGRAMS_KEY, setActiveProgram(await readActivePrograms(meta), clientId, programId));
}

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
