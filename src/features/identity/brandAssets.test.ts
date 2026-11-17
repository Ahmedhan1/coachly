import { describe, expect, it } from 'vitest';
import { containRect, onColorFor } from './brandAssets';

describe('brand icon geometry', () => {
  it('fits a wide logo inside the padded square, centred, aspect kept', () => {
    expect(containRect(1800, 900, 180, 0.1)).toEqual({ x: 18, y: 54, w: 144, h: 72 });
    expect(containRect(500, 1000, 512, 0)).toEqual({ x: 128, y: 0, w: 256, h: 512 });
    expect(containRect(0, 0, 100, 0.1)).toEqual({ x: 50, y: 50, w: 0, h: 0 });
  });
  it('picks a readable text colour on the brand', () => {
    expect(onColorFor('#C81E3A')).toBe('#FFFFFF');
    expect(onColorFor('#F2E81F')).toBe('#111111');
  });
});
