import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { parseActivePrograms, setActiveProgram, type ActivePrograms } from '@/domain/clientHub';
import type { MetaStore } from '@/services/license/metaStore';

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
