import { describe, expect, it } from 'vitest';
import { ringSegments } from './ringSegments';

const count = (s: string[], state: string) => s.filter((x) => x === state).length;

describe('ringSegments', () => {
  it('maps a 12-session package one to one, used first', () => {
    const s = ringSegments(12, 5, true);
    expect(s).toHaveLength(12);
    expect(count(s, 'used')).toBe(7);
    expect(s[7]).toBe('booked');
    expect(count(s, 'left')).toBe(4);
  });
  it('scales other package sizes to 12 segments', () => {
    expect(count(ringSegments(24, 12, false), 'used')).toBe(6);
    expect(count(ringSegments(8, 2, false), 'used')).toBe(9);
  });
  it('keeps one "left" segment while any session remains', () => {
    const s = ringSegments(30, 1, false);
    expect(count(s, 'left')).toBe(1);
  });
  it('is all used when nothing remains, and all left without a package', () => {
    expect(count(ringSegments(10, 0, true), 'used')).toBe(12);
    expect(count(ringSegments(0, 0, false), 'left')).toBe(12);
  });
});
