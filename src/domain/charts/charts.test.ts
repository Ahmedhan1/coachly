import { describe, expect, it } from 'vitest';
import { cleanSeries, dayNumber, dayTicks, isoFromDay, layoutLineChart, linearScale, nearestPointIndex, niceTicks } from '.';

describe('niceTicks', () => {
  it('covers the extent with 1/2/2.5/5 steps', () => {
    expect(niceTicks(71.2, 78.4, 4)).toEqual({ min: 70, max: 80, step: 2.5, ticks: [70, 72.5, 75, 77.5, 80] });
    expect(niceTicks(0, 100, 5).ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('never exceeds maxCount intervals', () => {
    for (const [a, b] of [[3, 97], [61.3, 61.9], [0.1, 0.9], [1200, 3100]] as const) {
      const r = niceTicks(a, b, 4);
      expect(r.ticks.length - 1).toBeLessThanOrEqual(4);
      expect(r.min).toBeLessThanOrEqual(a);
      expect(r.max).toBeGreaterThanOrEqual(b);
    }
  });
  it('widens a flat series around the value', () => {
    expect(niceTicks(80, 80, 4)).toMatchObject({ min: 79, max: 81 });
  });
  it('is free of floating point noise', () => {
    expect(niceTicks(0.1, 0.7, 3).ticks.every((t) => String(t).length < 6)).toBe(true);
  });
  it('rejects non-finite input', () => {
    expect(() => niceTicks(Number.NaN, 1)).toThrow(RangeError);
  });
});

describe('dayTicks', () => {
  it('includes both ends and stays within maxCount', () => {
    expect(dayTicks(0, 90, 4)).toEqual([0, 30, 60, 90]);
    expect(dayTicks(10, 11, 4)).toEqual([10, 11]);
    expect(dayTicks(5, 5)).toEqual([5]);
  });
});

describe('scale', () => {
  it('maps linearly and handles zero width', () => {
    expect(linearScale([0, 10], [100, 0])(2.5)).toBe(75);
    expect(linearScale([3, 3], [0, 50])(3)).toBe(25);
  });
  it('converts dates to day numbers and back', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(isoFromDay(dayNumber('2026-03-01'))).toBe('2026-03-01');
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
  });
});

describe('layoutLineChart', () => {
  const box = { width: 300, height: 160, padTop: 10, padBottom: 30, padStart: 40, padEnd: 10, rtl: false };
  const series = [
    { date: '2026-01-15', value: 78 },
    { date: '2026-01-01', value: 80 },
    { date: '2026-02-01', value: 76 },
  ];

  it('sorts by date and puts oldest on the left in LTR', () => {
    const l = layoutLineChart(series, box);
    expect(l.points.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-15', '2026-02-01']);
    expect(l.points[0]?.x).toBe(40);
    expect(l.points[2]?.x).toBe(290);
    expect(l.path.startsWith('M40 ')).toBe(true);
    expect(l.yLabelAnchor).toBe('start');
  });

  it('mirrors the time axis and the value axis in RTL', () => {
    const l = layoutLineChart(series, { ...box, rtl: true });
    expect(l.points[0]?.x).toBe(260); // oldest on the right, inside the value-label gutter
    expect(l.points[2]?.x).toBe(10);
    expect(l.yLabelAnchor).toBe('end');
    expect(l.yLabelX).toBe(298);
  });

  it('higher values sit higher', () => {
    const l = layoutLineChart(series, box);
    const [a, , c] = l.points;
    expect(a && c && a.y < c.y).toBe(true);
    for (const t of l.yTicks) expect(t.y).toBeGreaterThanOrEqual(10 - 1e-9);
  });

  it('handles empty and single-point series', () => {
    expect(layoutLineChart([], box).path).toBe('');
    const one = layoutLineChart([{ date: '2026-01-01', value: 70 }], box);
    expect(one.points).toHaveLength(1);
    expect(one.xTicks).toHaveLength(1);
    expect(one.points[0]?.x).toBe(165);
  });

  it('labels date ticks with real calendar dates', () => {
    const l = layoutLineChart(series, box, 4, 3);
    expect(l.xTicks.map((t) => t.date)).toEqual(['2026-01-01', '2026-01-17', '2026-02-01']);
  });
});

describe('cleanSeries / nearestPointIndex', () => {
  it('drops NaN and keeps the last value per date', () => {
    expect(cleanSeries([{ date: '2026-01-01', value: 1 }, { date: '2026-01-01', value: 2 }, { date: '2026-01-02', value: Number.NaN }])).toEqual([
      { date: '2026-01-01', value: 2 },
    ]);
  });
  it('finds the closest point', () => {
    expect(nearestPointIndex([{ x: 0 }, { x: 10 }, { x: 20 }], 13)).toBe(1);
    expect(nearestPointIndex([], 5)).toBe(-1);
  });
});
