import { describe, expect, it } from 'vitest';
import { checkPersonalRecord, personalRecordTimeline } from './records';
import type { LoggedSet } from './types';

const set = (performedAt: number, weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  exerciseId: 'bench',
  sessionId: `s${performedAt}`,
  performedAt,
  weightKg,
  reps,
  ...extra,
});

describe('checkPersonalRecord', () => {
  // history best: 100×5 -> e1RM 116.67; heaviest 105×1 -> e1RM 105
  const history = [set(1, 100, 5), set(2, 105, 1), set(3, 60, 12, { isWarmup: true }), set(4, 200, 1, { exerciseId: 'squat' })];

  it('first ever set is not a record', () => {
    expect(checkPersonalRecord([], set(10, 50, 5))).toEqual({ isRecord: false, kinds: [], previousBest: null });
  });

  it('higher estimated 1RM without heavier weight', () => {
    // 100 × 6 -> 100 × 1.2 = 120 > 116.67; weight 100 < 105
    const r = checkPersonalRecord(history, set(10, 100, 6));
    expect(r.isRecord).toBe(true);
    expect(r.kinds).toEqual(['estimatedOneRepMax']);
    expect(r.previousBest?.weightKg).toBe(105);
    expect(r.previousBest?.estimatedOneRepMax).toBeCloseTo(116.6667, 3);
  });

  it('heavier weight but lower e1RM', () => {
    // 107.5 × 1 -> 107.5 (< 116.67) but > 105
    expect(checkPersonalRecord(history, set(10, 107.5, 1)).kinds).toEqual(['weight']);
  });

  it('both kinds', () => {
    expect(checkPersonalRecord(history, set(10, 110, 3)).kinds).toEqual(['estimatedOneRepMax', 'weight']);
  });

  it('equal is not a record; warm-ups and other exercises are ignored', () => {
    expect(checkPersonalRecord(history, set(10, 100, 5)).isRecord).toBe(false);
    expect(checkPersonalRecord(history, set(10, 150, 1, { isWarmup: true })).isRecord).toBe(false);
    // squat 200 kg in history does not count against bench
    expect(checkPersonalRecord(history, set(10, 120, 1)).kinds).toEqual(['estimatedOneRepMax', 'weight']);
  });

  it('only sets before the candidate count', () => {
    const later = [...history, set(20, 150, 5)];
    expect(checkPersonalRecord(later, set(10, 110, 3)).isRecord).toBe(true);
  });
});

describe('personalRecordTimeline', () => {
  it('lists each record in order', () => {
    const t = personalRecordTimeline([set(3, 110, 3), set(1, 100, 5), set(2, 90, 5)]);
    expect(t.map((x) => x.set.performedAt)).toEqual([3]);
  });
});
