/** The slice of a program this view needs (the full Program model fits structurally). */
export interface UsageProgram {
  id: string;
  name: string;
  clientId: string | null;
  isTemplate: boolean;
  deletedAt: number | null;
  days: readonly { items: readonly { exerciseId: string }[] }[];
}

export interface UsageClient {
  id: string;
  name: string;
}

export interface ExerciseClientUsage {
  clientId: string;
  clientName: string;
  programNames: string[];
}

/** The trainer's clients that have `exerciseId` in one of their own (non-template, not deleted) programs. */
export function clientsUsingExercise(
  exerciseId: string,
  programs: readonly UsageProgram[],
  clients: readonly UsageClient[],
): ExerciseClientUsage[] {
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const byClient = new Map<string, string[]>();
  for (const program of programs) {
    if (program.isTemplate || program.deletedAt !== null || program.clientId === null) continue;
    if (!names.has(program.clientId)) continue;
    if (!program.days.some((day) => day.items.some((item) => item.exerciseId === exerciseId))) continue;
    byClient.set(program.clientId, [...(byClient.get(program.clientId) ?? []), program.name]);
  }
  return [...byClient]
    .map(([clientId, programNames]) => ({ clientId, clientName: names.get(clientId) ?? '', programNames }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'ar'));
}
