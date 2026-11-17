import { describe, expect, it } from 'vitest';
import { toIsoDate, workoutLogSchema, type ExerciseId, type ProgramDay, type ProgramItem } from '../models';
import type { LoggedSet } from '../strength';
import {
  addSet,
  adjustRest,
  completeSet,
  createSession,
  editSet,
  endRest,
  goToExercise,
  kgToUnit,
  nextProgramDayId,
  parseSessionState,
  reopenSet,
  restRemaining,
  setOrder,
  skipExercise,
  summarizeSession,
  swapExercise,
  toLocalId,
  toWorkoutLogInput,
  unitToKg,
  workoutLogsToSets,
  type SessionState,
} from '.';

const T0 = Date.UTC(2026, 10, 16, 15, 0, 0);

const item = (id: string, exerciseId: string, sets: number, group: string | null = null, restSec = 90): ProgramItem => ({
  id: toLocalId(id),
  exerciseId: exerciseId as ExerciseId,
  sets,
  reps: '8-10',
  restSec,
  tempo: '',
  rpe: null,
  supersetGroup: group,
  notes: '',
});

const day: ProgramDay = {
  id: toLocalId('day1'),
  name: 'لور',
  items: [item('i1', 'Squat', 2), item('i2', 'Curl', 2, 'A', 60), item('i3', 'Ext', 2, 'A', 60)],
};

const history: LoggedSet[] = [
  { exerciseId: 'Squat', sessionId: 'old', performedAt: T0 - 86_400_000, weightKg: 60, reps: 8 },
  { exerciseId: 'Squat', sessionId: 'old', performedAt: T0 - 86_400_000 + 1, weightKg: 62.5, reps: 8 },
];

const start = (): SessionState =>
  createSession({ key: 's1', clientId: 'c1', programId: 'p1', day, scheduleSessionId: null, history, now: T0 });

describe('session state machine', () => {
  it('pre-fills from last time and the reps target', () => {
    const s = start();
    expect(s.exercises[0]?.sets.map((x) => [x.weightKg, x.reps])).toEqual([
      [60, 10],
      [62.5, 10],
    ]);
    expect(s.exercises[1]?.sets[0]).toMatchObject({ weightKg: 0, reps: 10 });
    expect(s.current).toEqual({ exercise: 0, set: 0 });
  });

  it('orders supersets in rounds (A1, A2, A1, A2)', () => {
    expect(setOrder(start().exercises).map((p) => `${p.exercise}.${p.set}`)).toEqual(['0.0', '0.1', '1.0', '2.0', '1.1', '2.1']);
  });

  it('completing sets advances, rests only after the superset round', () => {
    let s = start();
    s = completeSet(s, history, T0 + 1000);
    expect(s.current).toEqual({ exercise: 0, set: 1 });
    expect(s.rest).toEqual({ startedAt: T0 + 1000, durationSec: 90 });
    s = completeSet(endRest(s), history, T0 + 200_000);
    s = completeSet(s, history, T0 + 300_000); // A1 round 1
    expect(s.rest).toBeNull();
    expect(s.current).toEqual({ exercise: 2, set: 0 });
    s = completeSet(s, history, T0 + 310_000); // A2 round 1
    expect(s.rest?.durationSec).toBe(60);
    expect(s.current).toEqual({ exercise: 1, set: 1 });
  });

  it('carries the weight used to the next open sets', () => {
    let s = editSet(start(), { exercise: 0, set: 0 }, { weightKg: 70 });
    s = completeSet(s, history, T0 + 1000);
    expect(s.exercises[0]?.sets[1]?.weightKg).toBe(70);
  });

  it('detects a PR against history, once per improvement', () => {
    let s = editSet(start(), { exercise: 0, set: 0 }, { weightKg: 65, reps: 8 });
    s = completeSet(s, history, T0 + 1000);
    expect(s.lastRecord).toMatchObject({ exerciseIndex: 0, setIndex: 0, kinds: ['estimatedOneRepMax', 'weight'], weightKg: 65 });
    s = editSet(s, { exercise: 0, set: 1 }, { weightKg: 60, reps: 8 });
    s = completeSet(s, history, T0 + 2000);
    expect(s.lastRecord).toBeNull();
    expect(s.records).toHaveLength(1);
  });

  it('no PR for an exercise without history', () => {
    let s = goToExercise(start(), 1);
    s = editSet(s, { exercise: 1, set: 0 }, { weightKg: 20 });
    s = completeSet(s, [], T0 + 1000);
    expect(s.lastRecord).toBeNull();
  });

  it('rest timer is computed from timestamps (survives backgrounding)', () => {
    const s = completeSet(start(), history, T0);
    expect(restRemaining(s, T0)).toBe(90);
    expect(restRemaining(s, T0 + 30_500)).toBe(60);
    expect(restRemaining(s, T0 + 600_000)).toBe(0);
    expect(restRemaining(adjustRest(s, 15, T0 + 1000), T0 + 1000)).toBe(104);
    expect(restRemaining(adjustRest(s, -200, T0 + 10_000), T0 + 10_000)).toBe(0);
  });

  it('skip, jump, reopen, swap and add set', () => {
    let s = skipExercise(start(), 0);
    expect(s.current).toEqual({ exercise: 1, set: 0 });
    s = goToExercise(s, 0);
    expect(s.exercises[0]?.skipped).toBe(false);
    s = completeSet(s, history, T0 + 1000);
    s = reopenSet(s, { exercise: 0, set: 0 });
    expect(s.exercises[0]?.sets[0]?.done).toBe(false);
    expect(s.current).toEqual({ exercise: 0, set: 0 });
    s = swapExercise(s, 0, 'Leg_Press', [], T0);
    expect(s.exercises[0]).toMatchObject({ exerciseId: 'Leg_Press' });
    expect(s.exercises[0]?.sets[0]?.weightKg).toBe(0);
    s = addSet(s, 0);
    expect(s.exercises[0]?.sets).toHaveLength(3);
  });

  it('round-trips through persistence and rejects garbage', () => {
    const s = completeSet(start(), history, T0);
    expect(parseSessionState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSessionState({ version: 2 })).toBeNull();
    expect(parseSessionState(undefined)).toBeNull();
  });

  it('builds a valid WorkoutLog with only done sets', () => {
    let s = completeSet(start(), history, T0);
    s = completeSet(endRest(s), history, T0 + 100_000);
    const input = toWorkoutLogInput(s, toIsoDate(new Date(T0)));
    expect(input.exercises).toHaveLength(1);
    expect(input.exercises[0]?.sets).toHaveLength(2);
    const log = workoutLogSchema.parse({ ...input, id: 'l1', clientId: 'c1', createdAt: T0, updatedAt: T0, deletedAt: null, demo: false });
    expect(workoutLogsToSets([log]).map((x) => x.weightKg)).toEqual([60, 62.5]);
    expect(summarizeSession(s)).toMatchObject({ doneSets: 2, totalSets: 6, exercisesDone: 1, volumeKg: 60 * 10 + 62.5 * 10 });
  });

  it('picks the next program day after the last logged one', () => {
    const days = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextProgramDayId(days, [], 'p')).toBe('a');
    const logs = [
      { programId: 'p', programDayId: 'a', createdAt: 1 },
      { programId: 'p', programDayId: 'c', createdAt: 3 },
      { programId: 'x', programDayId: 'a', createdAt: 9 },
    ];
    expect(nextProgramDayId(days, logs, 'p')).toBe('a');
    expect(nextProgramDayId(days, logs.slice(0, 1), 'p')).toBe('b');
  });

  it('converts weight units', () => {
    expect(kgToUnit(100, 'lb')).toBe(220.5);
    expect(unitToKg(220.5, 'lb')).toBeCloseTo(100.02, 1);
    expect(kgToUnit(62.5, 'kg')).toBe(62.5);
  });
});
