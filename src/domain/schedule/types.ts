/** A booked session at an absolute instant. */
export interface Session {
  id: string;
  clientId: string;
  /** Epoch milliseconds (UTC instant). */
  startMs: number;
  durationMinutes: number;
}

export function sessionEndMs(s: Pick<Session, 'startMs' | 'durationMinutes'>): number {
  return s.startMs + s.durationMinutes * 60_000;
}
