import { describe, expect, it } from 'vitest';
import { compareToLastTime, lastTime, sessionVolume } from './volume';
import type { LoggedSet } from './types';

const s = (sessionId: string, performedAt: number, weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  exerciseId: 'squat',
  sessionId,
  performedAt,
  weightKg,
  reps,
  ...extra,
});

describe('sessionVolume', () => {
  it('Σ weight × reps, warm-ups excluded', () => {
    // 100×5 + 100×5 + 90×8 = 500 + 500 + 720 = 1720 (40×10 warm-up excluded)
    expect(sessionVolume([s('a', 1, 40, 10, { isWarmup: true }), s('a', 2, 100, 5), s('a', 3, 100, 5), s('a', 4, 90, 8)])).toBe(1720);
  });

  it('empty session is 0', () => {
    expect(sessionVolume([])).toBe(0);
  });
});

describe('compareToLastTime', () => {
  const history = [
    s('old', 1000, 90, 5),
    s('old', 1001, 90, 5),
    s('prev', 2000, 95, 5),
    s('prev', 2001, 95, 4),
    s('prev', 2002, 50, 10, { exerciseId: 'bench' }),
  ];

  it('compares with the most recent earlier session of the same exercise', () => {
    // prev: volume 95×5 + 95×4 = 475 + 380 = 855; top 95; reps 9; e1RM 95×(1+5/30) = 110.83
    // now:  volume 100×5 + 100×5 = 1000;         top 100; reps 10; e1RM 100×(1+5/30) = 116.67
    const current = [s('now', 3000, 100, 5), s('now', 3001, 100, 5)];
    const c = compareToLastTime([...history, ...current], current, 'squat');
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.previous.sessionId).toBe('prev');
    expect(c.previous.volume).toBe(855);
    expect(c.volumeDelta).toBe(145);
    expect(c.topWeightDelta).toBe(5);
    expect(c.totalRepsDelta).toBe(1);
    expect(c.estimatedOneRepMaxDelta).toBeCloseTo(5.8333, 3);
  });

  it('null when no earlier session or no current sets', () => {
    expect(compareToLastTime([], [s('now', 3000, 100, 5)], 'squat')).toBeNull();
    expect(compareToLastTime(history, [], 'squat')).toBeNull();
  });

  it('lastTime ignores the current session and later sessions', () => {
    expect(lastTime(history, 'squat', 'x', 1500)?.sessionId).toBe('old');
    expect(lastTime(history, 'squat', 'prev', 5000)?.sessionId).toBe('old');
    expect(lastTime(history, 'deadlift', 'x', 5000)).toBeNull();
  });
});
