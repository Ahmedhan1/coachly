import { useCallback } from 'react';
import { useServices } from '@/app/services';
import type { CatalogExercise } from '@/domain/exercises';
import type { Client, ClientId, Program } from '@/domain/models';
import { autoProgram, type AutoDayKey } from '@/domain/programs/auto';
import { fitProfileOf } from '@/domain/programs/tailor';
import { t } from '@/i18n';
import { markActiveProgram } from '@/data/prefs/activePrograms';
import { newLocalId } from '@/features/programs/ids';
import { templateDayName } from '@/i18n/programNames';

/** Day names of a generated program: the template words (بوش، أبر بادي…), and "فول بادي A/B/C". */
export const autoDayName = (key: AutoDayKey): string => (key.startsWith('full_') ? `${templateDayName('full')} ${key.slice(5).toUpperCase()}` : templateDayName(key));

/**
 * «اعمل برنامج مناسب»: builds a starter program from the client's training profile, saves it as the
 * client's active program and returns it (null when the catalog left nothing to choose from).
 */
export function useAutoProgram() {
  const { data, meta } = useServices();
  return useCallback(
    async (client: Client, catalog: readonly CatalogExercise[]): Promise<Program | null> => {
      const p = client.trainingProfile;
      const body = autoProgram(
        { ...fitProfileOf(client), ...(p?.sessionsPerWeek ? { sessionsPerWeek: p.sessionsPerWeek } : {}), ...(p?.sessionMinutes ? { sessionMinutes: p.sessionMinutes } : {}) },
        catalog,
        { name: t('hub.tailor.autoName', { name: client.name }), dayName: autoDayName, newId: newLocalId, clientId: client.id as ClientId },
      );
      const days = body.days.filter((d) => d.items.length > 0);
      if (days.length === 0) return null;
      const program = await data.repos.programs.create({ ...body, days });
      await markActiveProgram(meta, client.id, program.id);
      return program;
    },
    [data, meta],
  );
}
