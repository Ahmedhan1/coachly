/** URLs between the hub and the screens it links to (one place, so every entry point agrees). */
export function sessionUrl(input: { clientId: string; programId?: string | null; dayId?: string | null; scheduleId?: string | null }): string {
  const params = new URLSearchParams({ client: input.clientId });
  if (input.scheduleId) params.set('schedule', input.scheduleId);
  if (input.programId) params.set('program', input.programId);
  if (input.programId && input.dayId) params.set('day', input.dayId);
  return `/session/new?${params.toString()}`;
}

export const clientUrl = (clientId: string, tab?: string) => `/clients/${clientId}${tab ? `?tab=${tab}` : ''}`;
export const bookUrl = (clientId: string) => `/schedule?book=1&client=${clientId}`;
export const programUrl = (programId: string) => `/programs/${programId}`;
export const exerciseUrl = (exerciseId: string) => `/exercises/${encodeURIComponent(exerciseId)}`;
