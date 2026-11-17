import { describe, expect, it } from 'vitest';
import { collectReferencedIds, isPurgeDue, PURGE_INTERVAL_MS, purgeCutoffMs, RETENTION_DAYS } from './retention';

const DAY = 86_400_000;

describe('retention', () => {
  it('cuts off 180 days before now', () => {
    expect(RETENTION_DAYS).toBe(180);
    expect(purgeCutoffMs(new Date(200 * DAY))).toBe(20 * DAY);
  });

  it('runs at most once a day, and again when the clock went backwards', () => {
    const now = new Date(10 * DAY);
    expect(isPurgeDue(null, now)).toBe(true);
    expect(isPurgeDue(now.getTime() - PURGE_INTERVAL_MS + 1, now)).toBe(false);
    expect(isPurgeDue(now.getTime() - PURGE_INTERVAL_MS, now)).toBe(true);
    expect(isPurgeDue(now.getTime() + 5 * DAY, now)).toBe(true);
  });

  it('finds candidate ids anywhere inside nested rows', () => {
    const rows = [
      { id: 'c1', photoId: 'img1', nested: { list: ['x', { deep: 'img2' }] } },
      { key: 'progress.photos.e1', value: [{ imageId: 'img3', thumbId: 'img4' }] },
      'img5',
      null,
      42,
    ];
    const found = collectReferencedIds(rows, new Set(['img1', 'img2', 'img3', 'img4', 'img5', 'img6']));
    expect([...found].sort()).toEqual(['img1', 'img2', 'img3', 'img4', 'img5']);
  });
});
