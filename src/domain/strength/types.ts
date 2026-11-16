/** One logged working set. `performedAt` is epoch milliseconds. */
export interface LoggedSet {
  exerciseId: string;
  sessionId: string;
  performedAt: number;
  weightKg: number;
  reps: number;
  /** Warm-up sets are excluded from records and volume. */
  isWarmup?: boolean;
}
