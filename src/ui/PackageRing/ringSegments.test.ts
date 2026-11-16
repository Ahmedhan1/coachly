import { describe, expect, it } from 'vitest';
import { ringSegments } from './ringSegments';

const count = (s: string[], state: string) => s.filter((x) => x === state).length;

describe('ringSegments', () => {
  it('maps a 12-session package one to one: remaining first, then used', () => {
    const s = ringSegments(12, 3);
    expect(s).toHaveLength(12);
    expect(count(s, 'left')).toBe(3);
    expect(s.slice(0, 3)).toEqual(['left', 'left', 'left']);
    expect(s.slice(3).every((x) => x === 'used')).toBe(true);
  });
  it('scales other package sizes to 12 segments', () => {
    expect(count(ringSegments(24, 12), 'left')).toBe(6);
    expect(count(ringSegments(8, 2), 'left')).toBe(3);
  });
  it('keeps one "left" segment while any session remains, and one "used" once any was used', () => {
    expect(count(ringSegments(30, 1), 'left')).toBe(1);
    expect(count(ringSegments(30, 29), 'used')).toBe(1);
  });
  it('is all left for a fresh package (or carried-over extra), all used when nothing remains or no package', () => {
    expect(count(ringSegments(10, 10), 'left')).toBe(12);
    expect(count(ringSegments(10, 14), 'left')).toBe(12);
    expect(count(ringSegments(10, 0), 'used')).toBe(12);
    expect(count(ringSegments(0, 0), 'used')).toBe(12);
  });
});
