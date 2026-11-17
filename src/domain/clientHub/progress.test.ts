import { describe, expect, it } from 'vitest';
import { progressTimeline } from './progress';

const e = (id: string, date: string, measurements: { weightKg?: number; waistCm?: number }, photos = 0) => ({
  id,
  date,
  measurements,
  photoIds: Array.from({ length: photos }, (_, i) => `img${i}`),
});

describe('progressTimeline', () => {
  it('lists check-ins newest first with the change since the previous value of each measure', () => {
    const items = progressTimeline([e('b', '2026-11-08', { weightKg: 80 }), e('a', '2026-11-01', { weightKg: 82, waistCm: 90 }), e('c', '2026-11-15', { weightKg: 79.4, waistCm: 88 }, 2)]);
    expect(items.map((i) => i.entry.id)).toEqual(['c', 'b', 'a']);
    expect(items[0]?.weightDeltaKg).toBeCloseTo(-0.6, 5);
    expect(items[0]?.waistDeltaCm).toBe(-2);
    expect(items[0]?.photos).toBe(2);
    expect(items[1]?.waistDeltaCm).toBeNull();
    expect(items[2]?.weightDeltaKg).toBeNull();
  });
});
