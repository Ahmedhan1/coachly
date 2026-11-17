import { dayNumber, isoFromDay, linearScale } from './scale';
import { dayTicks, niceTicks } from './ticks';

export interface DatedValue {
  date: string;
  value: number;
}

export interface ChartBox {
  width: number;
  height: number;
  /** Space reserved for the value labels (on the inline-start side) and the date labels (bottom). */
  padTop: number;
  padBottom: number;
  padStart: number;
  padEnd: number;
  /** Right-to-left: time runs from the right (oldest) to the left (newest) and the value axis sits on the right. */
  rtl: boolean;
}

export interface PlottedPoint extends DatedValue {
  x: number;
  y: number;
}

export interface LineChartLayout {
  points: PlottedPoint[];
  /** SVG path ("M x y L x y …"); empty when there are no points. */
  path: string;
  yTicks: { value: number; y: number }[];
  xTicks: { date: string; x: number }[];
  /** Plot area in SVG coordinates. */
  plot: { left: number; right: number; top: number; bottom: number };
  /** x of the value-axis labels and their text anchor ('start' | 'end' in SVG terms). */
  yLabelX: number;
  yLabelAnchor: 'start' | 'end';
}

/** Drops non-finite values, keeps the latest value per date, sorts by date. */
export function cleanSeries(points: readonly DatedValue[]): DatedValue[] {
  const byDate = new Map<string, number>();
  for (const p of points) if (Number.isFinite(p.value)) byDate.set(p.date, p.value);
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Positions a single time series inside `box`. Pure: the component only draws what this returns. */
export function layoutLineChart(series: readonly DatedValue[], box: ChartBox, maxYTicks = 4, maxXTicks = 3): LineChartLayout {
  const data = cleanSeries(series);
  const left = box.rtl ? box.padEnd : box.padStart;
  const right = box.width - (box.rtl ? box.padStart : box.padEnd);
  const top = box.padTop;
  const bottom = box.height - box.padBottom;
  const plot = { left, right, top, bottom };
  const yLabelX = box.rtl ? box.width - 2 : 2;
  const yLabelAnchor = box.rtl ? 'end' : 'start';
  if (data.length === 0) return { points: [], path: '', yTicks: [], xTicks: [], plot, yLabelX, yLabelAnchor };

  const values = data.map((d) => d.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), maxYTicks);
  const y = linearScale([ticks.min, ticks.max], [bottom, top]);
  const days = data.map((d) => dayNumber(d.date));
  const first = days[0] ?? 0;
  const last = days[days.length - 1] ?? first;
  const x = linearScale([first, last], box.rtl ? [right, left] : [left, right]);

  const points = data.map((d, i) => ({ ...d, x: x(days[i] ?? first), y: y(d.value) }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
  const xTicks =
    first === last
      ? [{ date: data[0]?.date ?? '', x: x(first) }]
      : dayTicks(first, last, maxXTicks).map((day) => ({ date: isoFromDay(day), x: x(day) }));
  return {
    points,
    path,
    yTicks: ticks.ticks.map((value) => ({ value, y: y(value) })),
    xTicks: dedupeByDate(xTicks),
    plot,
    yLabelX,
    yLabelAnchor,
  };
}

function dedupeByDate<T extends { date: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.date) ? false : (seen.add(i.date), true)));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Index of the plotted point closest to `x` (for tap/hover). -1 when there are none. */
export function nearestPointIndex(points: readonly { x: number }[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const d = Math.abs(p.x - x);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}
