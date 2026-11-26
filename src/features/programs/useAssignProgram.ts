import { useMemo } from 'react';
import { useServices } from '@/app/services';
import type { Client, ClientId, Program } from '@/domain/models';
import { copyProgramToClient, instantiateTemplate, type BuiltinTemplate } from '@/domain/programs';
import { t } from '@/i18n';
import { markActiveProgram } from '@/data/prefs/activePrograms';
import { newLocalId } from './ids';
import { templateDayName } from '@/i18n/programNames';

/**
 * Giving a client a program, from anywhere (client hub, program builder, programs list). Whatever the
 * source, the result is the client's own copy and becomes their active program; the old one stays in history.
 */
export function useAssignProgram() {
  const { data, meta } = useServices();
  const repos = data.repos;
  return useMemo(() => {
    const nameFor = (client: Pick<Client, 'name'>) => t('training.programs.forClient', { name: client.name });
    const activate = async (program: Program, clientId: string) => {
      await markActiveProgram(meta, clientId, program.id);
      return program;
    };
    return {
      activate,
      async fromBuiltin(tpl: BuiltinTemplate, client: Client): Promise<Program> {
        const body = instantiateTemplate(tpl, { name: nameFor(client), dayName: templateDayName, newId: newLocalId, clientId: client.id });
        return activate(await repos.programs.create(body), client.id);
      },
      /** A template or another client's program: a fresh copy for this client. */
      async copyFor(source: Program, client: Client): Promise<Program> {
        const body = copyProgramToClient(source, client.id as ClientId, newLocalId, source.isTemplate ? source.name : nameFor(client));
        return activate(await repos.programs.create(body), client.id);
      },
      /** An unassigned (non-template) program: give it to the client as it is. */
      async adopt(program: Program, client: Client): Promise<Program> {
        return activate(await repos.programs.update(program.id, { clientId: client.id as ClientId, isTemplate: false }), client.id);
      },
    };
  }, [repos, meta]);
}
