import { describe, expect, it } from 'vitest';
import { conflictsWith, findConflicts, overlaps } from './conflicts';

const H = 3_600_000;
const s = (id: string, startHour: number, durationMinutes = 60) => ({ id, clientId: 'c', startMs: startHour * H, durationMinutes });

describe('overlaps', () => {
  it('touching ends are not conflicts', () => {
    expect(overlaps(s('a', 10), s('b', 11))).toBe(false);
    expect(overlaps(s('b', 11), s('a', 10))).toBe(false);
  });

  it('partial, containing and identical intervals conflict', () => {
    expect(overlaps(s('a', 10, 90), s('b', 11))).toBe(true);
    expect(overlaps(s('a', 9, 240), s('b', 10, 30))).toBe(true);
    expect(overlaps(s('a', 10), s('b', 10))).toBe(true);
  });
});

describe('conflictsWith', () => {
  it('finds clashes and ignores the session itself (editing)', () => {
    const existing = [s('a', 9), s('b', 10), s('c', 11)];
    expect(conflictsWith(s('new', 10.5), existing).map((x) => x.id)).toEqual(['b', 'c']);
    expect(conflictsWith(s('b', 10), existing)).toEqual([]);
  });
});

describe('findConflicts', () => {
  it('reports each overlapping pair once', () => {
    const list = [s('c', 12), s('a', 10, 150), s('b', 11), s('d', 13), s('e', 15)];
    // a: 10:00–12:30 overlaps b (11–12) and c (12–13); d (13–14) touches c only; e separate
    expect(findConflicts(list).map(([x, y]) => `${x.id}-${y.id}`)).toEqual(['a-b', 'a-c']);
  });

  it('back-to-back sessions produce no conflicts', () => {
    expect(findConflicts([s('a', 8), s('b', 9), s('c', 10)])).toEqual([]);
  });
});
