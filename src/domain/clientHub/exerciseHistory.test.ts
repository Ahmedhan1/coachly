import { describe, expect, it } from 'vitest';
import { exerciseHistory, trainedExercises } from './exerciseHistory';

type Set = { weightKg: number; reps: number; done: boolean };
const log = (id: string, date: string, exercises: Array<[string, Set[]]>) => ({
  id,
  date,
  createdAt: Date.parse(date),
  exercises: exercises.map(([exerciseId, sets]) => ({ exerciseId, sets })),
});
const s = (weightKg: number, reps: number, done = true): Set => ({ weightKg, reps, done });

const logs = [
  log('l2', '2026-11-10', [['squat', [s(60, 8), s(62.5, 6)]], ['plank', [s(0, 40)]]]),
  log('l1', '2026-11-03', [['squat', [s(55, 8), s(80, 1, false)]]]),
  log('l3', '2026-11-14', [['squat', [s(50, 5)]]]),
];

describe('exerciseHistory', () => {
  it('lists the sessions newest first with the best set, and only counts done sets', () => {
    const h = exerciseHistory(logs, 'squat');
    expect(h.entries.map((e) => e.logId)).toEqual(['l3', 'l2', 'l1']);
    const l2 = h.entries[1];
    expect(l2?.best).toEqual({ weightKg: 60, reps: 8 }); // 76 beats 62.5×6 = 75
    expect(l2?.bestE1rm).toBeCloseTo(76, 5);
    expect(l2?.volumeKg).toBe(855);
    expect(h.entries[2]?.sets).toEqual([{ weightKg: 55, reps: 8 }]);
  });
  it('gives the all-time bests and an oldest-first 1RM series for the chart', () => {
    const h = exerciseHistory(logs, 'squat');
    expect(h.bestWeightKg).toBe(62.5);
    expect(h.bestE1rm).toBeCloseTo(76, 5);
    expect(h.series.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-10', '2026-11-14']);
  });
  it('handles body-weight work (no weight): best set is the most reps', () => {
    const h = exerciseHistory(logs, 'plank');
    expect(h.entries[0]?.best).toEqual({ weightKg: 0, reps: 40 });
    expect(h.bestE1rm).toBe(0);
  });
  it('is empty for an exercise never done', () => {
    expect(exerciseHistory(logs, 'bench')).toEqual({ entries: [], bestE1rm: 0, bestWeightKg: 0, series: [] });
  });
});

describe('trainedExercises', () => {
  it('summarises every exercise the client did, most recent first, with the 1RM trend', () => {
    const list = trainedExercises(logs);
    expect(list.map((x) => x.exerciseId)).toEqual(['squat', 'plank']);
    const squat = list[0];
    expect(squat?.sessions).toBe(3);
    expect(squat?.lastDate).toBe('2026-11-14');
    expect(squat?.lastBest).toEqual({ weightKg: 50, reps: 5 });
    expect(squat?.trend).toBe('down');
    expect(list[1]?.trend).toBeNull();
  });
});
