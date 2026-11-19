import { describe, expect, it } from 'vitest';
import { fitRect, radiusPx, snapshotStyles, UNDER_SELECTOR } from './composite';

const box = { x: 10, y: 20, w: 100, h: 100 };

describe('fitRect', () => {
  it('cover fills the box and crops the long side, centred', () => {
    expect(fitRect('cover', box, 480, 320)).toEqual({ x: -15, y: 20, w: 150, h: 100 });
  });
  it('contain fits inside the box, centred', () => {
    expect(fitRect('contain', box, 480, 320)).toEqual({ x: 10, y: 20 + (100 - 200 / 3) / 2, w: 100, h: 200 / 3 });
  });
  it('fill stretches to the box; unknown sizes fall back to the box', () => {
    expect(fitRect('fill', box, 480, 320)).toEqual(box);
    expect(fitRect('cover', box, 0, 0)).toEqual(box);
  });
  it('scale-down never enlarges a small picture', () => {
    expect(fitRect('scale-down', box, 50, 25)).toEqual({ x: 35, y: 57.5, w: 50, h: 25 });
  });
});

describe('radiusPx', () => {
  it('reads px and percent radii and caps them at half the shorter side', () => {
    expect(radiusPx('8px', 96, 96)).toBe(8);
    expect(radiusPx('50%', 96, 96)).toBe(48);
    expect(radiusPx('200px', 96, 60)).toBe(30);
    expect(radiusPx('0px', 96, 96)).toBe(0);
    expect(radiusPx('', 96, 96)).toBe(0);
  });
});

describe('snapshot styles', () => {
  it('hide pictures and clear the fills under the background and cover photo', () => {
    const css = snapshotStyles();
    expect(css).toContain('img { visibility: hidden !important; }');
    expect(css).toContain('.hero.photo { background: transparent !important; }');
    expect(UNDER_SELECTOR).toBe('.ptpdf-bg, .cimg');
  });
});

describe('ResolvedImages', () => {
  it('keeps the original picture when the canvas downscaler fails (iPhone), instead of an empty frame', async () => {
    const { ResolvedImages } = await import('./images');
    const original = new Blob(['x'], { type: 'image/webp' });
    const made: Blob[] = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      made.push(b as Blob);
      return `blob:test/${made.length}`;
    };
    URL.revokeObjectURL = () => undefined;
    try {
      const ref = { kind: 'pack', path: 'img/a.webp' } as const;
      const r = await ResolvedImages.resolve([ref], { load: async () => original }, {
        downscale: async () => {
          throw new Error('decode failed');
        },
      });
      expect(r.url(ref)).toBe('blob:test/1');
      expect(made[0]).toBe(original);
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    }
  });
});
