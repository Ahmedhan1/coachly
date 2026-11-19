import { describe, expect, it } from 'vitest';
import { isBlank } from './drawImage';

describe('isBlank (Safari empty-draw check)', () => {
  it('is true when nothing was painted', () => {
    expect(isBlank(new Uint8ClampedArray(4 * 100), 1)).toBe(true);
  });

  it('is false as soon as one sampled pixel has any alpha', () => {
    const rgba = new Uint8ClampedArray(4 * 100);
    rgba[4 * 50 + 3] = 1;
    expect(isBlank(rgba, 1)).toBe(false);
  });

  it('treats an opaque white picture as painted, not blank', () => {
    expect(isBlank(new Uint8ClampedArray(4 * 64).fill(255))).toBe(false);
  });
});
