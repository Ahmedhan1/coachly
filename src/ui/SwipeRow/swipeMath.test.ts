import { describe, expect, it } from 'vitest';
import { revealDistance, settle } from './swipeMath';

describe('swipe math', () => {
  it('reveals when swiping right in RTL and left in LTR', () => {
    expect(revealDistance(50, true, 0, 300)).toBe(50);
    expect(revealDistance(-50, true, 0, 300)).toBe(0);
    expect(revealDistance(-50, false, 0, 300)).toBe(50);
  });
  it('clamps to the max and continues from an open row', () => {
    expect(revealDistance(500, true, 0, 300)).toBe(300);
    expect(revealDistance(-30, true, 88, 300)).toBe(58);
  });
  it('settles closed, open, or deletes on a long swipe', () => {
    expect(settle(20, 88, 375)).toBe('closed');
    expect(settle(50, 88, 375)).toBe('open');
    expect(settle(240, 88, 375)).toBe('delete');
  });
});
