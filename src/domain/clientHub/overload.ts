import { targetReps } from '../programs/reps';
import type { SetValue } from './exerciseHistory';

/** Next-time suggestion shown beside "last time" in session mode. The trainer always decides. */
export type OverloadHint = { kind: 'add_weight'; weightKg: number } | { kind: 'add_reps'; weightKg: number; reps: number };

export function overloadHint(last: readonly SetValue[], targetText: string, stepKg: number): OverloadHint | null {
  const top = targetReps(targetText);
  if (last.length === 0 || top === null) return null;
  const weightKg = Math.max(...last.map((s) => s.weightKg));
  const working = last.filter((s) => s.weightKg === weightKg);
  const minReps = Math.min(...working.map((s) => s.reps));
  if (weightKg > 0 && last.every((s) => s.reps >= top)) {
    return { kind: 'add_weight', weightKg: Math.round((weightKg + stepKg) * 100) / 100 };
  }
  return { kind: 'add_reps', weightKg, reps: weightKg > 0 ? Math.min(top, minReps + 1) : minReps + 1 };
}
