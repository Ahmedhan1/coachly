import { useCallback, useRef, useState } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { programSchema, type Program } from '@/domain/models';
import type { ProgramBody } from '@/domain/programs';

export type SaveStatus = 'saved' | 'saving' | 'error';

export const bodyOf = (p: Program): ProgramBody => ({
  name: p.name,
  clientId: p.clientId,
  isTemplate: p.isTemplate,
  days: p.days,
  notes: p.notes,
});

export interface ProgramEditor {
  /** undefined while loading, null when the program does not exist. */
  program: Program | null | undefined;
  body: ProgramBody | null | undefined;
  status: SaveStatus;
  /** Applies an edit immediately on screen and autosaves it (zod-validated by the repository). */
  apply: (edit: (body: ProgramBody) => ProgramBody) => void;
}

/**
 * Local-first editing of one program: every edit shows at once and is saved through the repository in
 * order (a promise chain), so fast edits and drag-reorders never race each other.
 */
export function useProgramEditor(programId: string): ProgramEditor {
  const repos = useRepos();
  const program = useLive(async () => (await repos.programs.get(programId)) ?? null, [repos, programId]);
  const [local, setLocal] = useState<{ id: string; body: ProgramBody } | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef<{ id: string; body: ProgramBody } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const body = local?.id === programId ? local.body : program ? bodyOf(program) : program;

  const apply = useCallback(
    (edit: (body: ProgramBody) => ProgramBody) => {
      const base = latest.current?.id === programId ? latest.current.body : body;
      if (!base || !program) return;
      const next = edit(base);
      if (next === base) return;
      latest.current = { id: programId, body: next };
      setLocal(latest.current);
      const check = programSchema.safeParse({ ...program, ...next });
      if (!check.success) {
        setStatus('error');
        return;
      }
      setStatus('saving');
      queue.current = queue.current
        .then(() => repos.programs.update(programId, next))
        .then(
          () => {
            if (latest.current?.body === next) setStatus('saved');
          },
          () => setStatus('error'),
        );
    },
    [body, program, programId, repos],
  );

  return { program, body, status, apply };
}
