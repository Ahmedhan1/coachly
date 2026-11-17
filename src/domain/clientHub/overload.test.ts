import { describe, expect, it } from 'vitest';
import { overloadHint } from './overload';

describe('overloadHint (progressive overload, a suggestion only)', () => {
  it('adds one weight step when every set reached the top of the rep target', () => {
    expect(overloadHint([{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }], '8-10', 2.5)).toEqual({ kind: 'add_weight', weightKg: 62.5 });
  });
  it('keeps the weight and asks for one more rep otherwise', () => {
    expect(overloadHint([{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 8 }], '8-10', 2.5)).toEqual({ kind: 'add_reps', weightKg: 60, reps: 9 });
  });
  it('uses the heaviest working weight of last time', () => {
    expect(overloadHint([{ weightKg: 50, reps: 12 }, { weightKg: 55, reps: 12 }], '12', 2.5)).toEqual({ kind: 'add_weight', weightKg: 57.5 });
  });
  it('body-weight work: more reps, never more weight', () => {
    expect(overloadHint([{ weightKg: 0, reps: 12 }], '12', 2.5)).toEqual({ kind: 'add_reps', weightKg: 0, reps: 13 });
  });
  it('no hint without last time or with a free-text target', () => {
    expect(overloadHint([], '8', 2.5)).toBeNull();
    expect(overloadHint([{ weightKg: 40, reps: 8 }], 'AMRAP', 2.5)).toBeNull();
  });
});
