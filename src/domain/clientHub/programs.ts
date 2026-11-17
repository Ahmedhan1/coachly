import { z } from 'zod';

/**
 * "One active program per client, with a history of past programs." The program table has no flag for it,
 * so the trainer's choice is a small map clientId → programId (kept in the meta store, inside backups).
 * Without a valid choice the newest program the client got is the active one.
 */
export type ActivePrograms = Readonly<Record<string, string>>;

const activeProgramsSchema = z.record(z.string(), z.string());

export function parseActivePrograms(raw: unknown): ActivePrograms {
  const parsed = activeProgramsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function setActiveProgram(map: ActivePrograms, clientId: string, programId: string | null): ActivePrograms {
  const next: Record<string, string> = { ...map };
  if (programId === null) delete next[clientId];
  else next[clientId] = programId;
  return next;
}

export interface ProgramLike {
  id: string;
  clientId: string | null;
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
}

export function splitClientPrograms<T extends ProgramLike>(
  programs: readonly T[],
  clientId: string,
  activeId: string | undefined,
): { active: T | null; past: T[] } {
  const own = programs.filter((p) => p.clientId === clientId && !p.isTemplate);
  const chosen = own.find((p) => p.id === activeId);
  const active = chosen ?? own.reduce<T | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
  const past = own.filter((p) => p !== active).sort((a, b) => b.updatedAt - a.updatedAt);
  return { active, past };
}
