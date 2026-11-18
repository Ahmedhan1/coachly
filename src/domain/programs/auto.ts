import { assessExercise, type FitLevel, type FitProfile, type TrainingEmphasis } from '../exercises/fit';
import type { CatalogExercise, MuscleGroupId } from '../exercises';
import type { ExerciseId, ProgramDay, ProgramItem } from '../models';
import { normalizeSupersets } from './supersets';
import type { LocalIdFactory, ProgramBody } from './types';

/**
 * «اعمل برنامج مناسب»: a starter program from the client's training profile. Deterministic: the same
 * profile and catalog always give the same program. The result is an ordinary program the trainer edits.
 */

export type AutoDayKey = 'full_a' | 'full_b' | 'full_c' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';

interface Slot {
  muscles: readonly MuscleGroupId[];
  mechanic?: 'compound' | 'isolation';
  force?: 'push' | 'pull';
}

const C = (muscles: MuscleGroupId[], force?: 'push' | 'pull'): Slot => ({ muscles, mechanic: 'compound', ...(force ? { force } : {}) });
const I = (muscles: MuscleGroupId[]): Slot => ({ muscles, mechanic: 'isolation' });
const A = (muscles: MuscleGroupId[]): Slot => ({ muscles });

const DAYS: Record<AutoDayKey, readonly Slot[]> = {
  full_a: [C(['quads']), C(['chest'], 'push'), C(['lats', 'middle_back'], 'pull'), A(['hamstrings', 'glutes']), A(['shoulders']), A(['abs']), I(['biceps']), I(['triceps'])],
  full_b: [C(['glutes', 'hamstrings']), C(['middle_back', 'lats'], 'pull'), C(['shoulders'], 'push'), A(['quads']), A(['chest']), A(['abs', 'obliques']), I(['triceps']), A(['calves'])],
  full_c: [C(['quads']), C(['lats']), C(['chest']), A(['hamstrings']), I(['shoulders']), A(['abs']), I(['biceps']), A(['calves'])],
  upper: [C(['chest'], 'push'), C(['lats'], 'pull'), C(['shoulders'], 'push'), C(['middle_back'], 'pull'), I(['biceps']), I(['triceps']), I(['shoulders']), A(['abs'])],
  lower: [C(['quads']), A(['hamstrings']), C(['glutes']), I(['quads']), A(['calves']), A(['abs']), A(['adductors', 'abductors'])],
  push: [C(['chest'], 'push'), C(['shoulders'], 'push'), A(['chest']), I(['shoulders']), I(['triceps']), A(['triceps']), A(['abs'])],
  pull: [C(['lats'], 'pull'), C(['middle_back'], 'pull'), A(['lats']), I(['biceps']), A(['biceps']), A(['traps', 'forearms']), A(['abs'])],
  legs: [C(['quads']), A(['hamstrings']), A(['glutes']), I(['quads']), A(['calves']), A(['abs']), A(['hamstrings', 'glutes'])],
};

/** The weekly split for a number of sessions (default 3) and level. */
export function autoSplit(sessionsPerWeek: number | undefined, level: FitLevel | undefined): AutoDayKey[] {
  const n = Math.min(6, Math.max(1, sessionsPerWeek ?? 3));
  if (n === 1) return ['full_a'];
  if (n === 2) return ['full_a', 'full_b'];
  if (n === 3) return level === 'intermediate' || level === 'advanced' ? ['push', 'pull', 'legs'] : ['full_a', 'full_b', 'full_c'];
  if (n === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (n === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

/** How many exercises fit in a session of `minutes` (default 60 → 6). */
export function exerciseCount(minutes: number | undefined): number {
  return Math.min(8, Math.max(3, Math.round(((minutes ?? 60) - 6) / 9)));
}

export interface Prescription {
  sets: number;
  reps: string;
  restSec: number;
}

const DOSE: Record<TrainingEmphasis, [Prescription, Prescription]> = {
  strength: [{ sets: 5, reps: '4-6', restSec: 180 }, { sets: 3, reps: '8-10', restSec: 90 }],
  muscle: [{ sets: 4, reps: '8-10', restSec: 120 }, { sets: 3, reps: '10-12', restSec: 75 }],
  fat_loss: [{ sets: 3, reps: '12-15', restSec: 60 }, { sets: 3, reps: '15', restSec: 45 }],
  fitness: [{ sets: 3, reps: '10-12', restSec: 75 }, { sets: 3, reps: '12-15', restSec: 60 }],
  rehab: [{ sets: 2, reps: '12-15', restSec: 60 }, { sets: 2, reps: '15', restSec: 45 }],
};

/** Sets / reps / rest for the goal (default: muscle). Beginners do at most 3 sets. */
export function autoPrescription(emphasis: TrainingEmphasis | undefined, level: FitLevel | undefined, compound: boolean): Prescription {
  const dose = DOSE[emphasis ?? 'muscle'][compound ? 0 : 1];
  return level === 'beginner' ? { ...dose, sets: Math.min(3, dose.sets) } : { ...dose };
}

const BLOCKED_CATEGORIES = new Set(['stretching', 'cardio', 'plyometrics', 'olympic_weightlifting', 'strongman']);

function pick(slot: Slot, pool: readonly { e: CatalogExercise; base: number }[], usedToday: ReadonlySet<string>, used: ReadonlyMap<string, number>): CatalogExercise | null {
  let best: { e: CatalogExercise; score: number } | null = null;
  for (const { e, base } of pool) {
    const main = e.primaryMuscles[0];
    if (!main || !slot.muscles.includes(main) || usedToday.has(e.id)) continue;
    let score = base - (used.get(e.id) ?? 0) * 25;
    if (slot.mechanic && e.mechanic === slot.mechanic) score += 8;
    if (slot.force && e.force === slot.force) score += 4;
    if (slot.muscles[0] === main) score += 2;
    if (!best || score > best.score || (score === best.score && e.id < best.e.id)) best = { e, score };
  }
  return best?.e ?? null;
}

export interface AutoProgramOptions {
  name: string;
  /** Translated day name for a key (full_a, upper…). */
  dayName: (key: AutoDayKey) => string;
  newId: LocalIdFactory;
  clientId: ProgramBody['clientId'];
}

/** A starter program for the profile; slots with no safe exercise are skipped. */
export function autoProgram(profile: FitProfile & { sessionsPerWeek?: number; sessionMinutes?: number }, catalog: readonly CatalogExercise[], options: AutoProgramOptions): ProgramBody {
  const joints = profile.injuredJoints ?? [];
  const rehab = profile.emphasis === 'rehab';
  const pool = catalog.flatMap((e) => {
    if (BLOCKED_CATEGORIES.has(e.category)) return [];
    if (e.category === 'powerlifting' && profile.level !== 'advanced') return [];
    const fit = assessExercise(e, profile, joints);
    if (!fit.available || fit.avoided || !fit.levelOk) return [];
    if (fit.risks.some((r) => r.stress === 'high' || rehab)) return [];
    const base = fit.score + (e.popularRank !== undefined ? 10 : 0) - fit.risks.length * 6;
    return [{ e, base }];
  });
  const count = exerciseCount(profile.sessionMinutes);
  const used = new Map<string, number>();
  const days: ProgramDay[] = autoSplit(profile.sessionsPerWeek, profile.level).map((key) => {
    const today = new Set<string>();
    const items: ProgramItem[] = [];
    const slots = DAYS[key];
    for (let i = 0; i < slots.length && items.length < count; i += 1) {
      const slot = slots[i];
      if (!slot) continue;
      const e = pick(slot, pool, today, used);
      if (!e) continue;
      today.add(e.id);
      used.set(e.id, (used.get(e.id) ?? 0) + 1);
      const dose = autoPrescription(profile.emphasis, profile.level, (e.mechanic ?? slot.mechanic ?? 'compound') === 'compound');
      items.push({ id: options.newId(), exerciseId: e.id as ExerciseId, ...dose, tempo: '', rpe: null, supersetGroup: null, notes: '' });
    }
    return { id: options.newId(), name: options.dayName(key), items: normalizeSupersets(items) };
  });
  return { name: options.name, clientId: options.clientId, isTemplate: false, days, notes: '' };
}
