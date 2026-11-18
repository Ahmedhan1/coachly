import { useCallback } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { parseDietProfile, type DietProfile } from '@/domain/meals';

/** Per-client calorie-control choices, kept in the nutrition key/value store (meta table, in backups). */
export const dietProfileKey = (clientId: string) => `nutrition.dietProfile.${clientId}`;

export function useDietProfile(clientId: string): { profile: DietProfile | undefined; save: (p: DietProfile) => Promise<void> } {
  const { meta } = useServices();
  const profile = useLive(async () => parseDietProfile(await meta.get(dietProfileKey(clientId))), [meta, clientId]);
  const save = useCallback((p: DietProfile) => meta.set(dietProfileKey(clientId), p), [meta, clientId]);
  return { profile, save };
}
