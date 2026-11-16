import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { layoutLineChart, nearestPointIndex, type DatedValue } from '@/domain/charts';
import styles from './LineChart.module.css';

export interface LineChartProps {
  series: readonly DatedValue[];
  /** Accessible name of the chart, e.g. "الوزن بالكيلو". */
  label: string;
  formatValue: (value: number) => string;
  formatDate: (isoDate: string) => string;
  /** Column headers of the screen-reader data table. */
  dateHeader: string;
  valueHeader: string;
  height?: number;
}

const DEFAULT_WIDTH = 320;
const PAD = { padTop: 12, padBottom: 28, padStart: 44, padEnd: 12 };

/**
 * One time series as a pure SVG line (no chart library). Geometry comes from src/domain/charts; colors are
 * design tokens so light and dark both work. RTL documents mirror the time axis (oldest on the right).
 * Tap or hover shows the nearest value; a visually hidden table carries the data for screen readers.
 */
export function LineChart({ series, label, formatValue, formatDate, dateHeader, valueHeader, height = 180 }: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [rtl, setRtl] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setRtl(getComputedStyle(el).direction === 'rtl');
    if (el.clientWidth > 0) setWidth(el.clientWidth);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => layoutLineChart(series, { width, height, ...PAD, rtl }, 4, width < 360 ? 3 : 4), [series, width, height, rtl]);
  const point = active === null ? undefined : layout.points[active];

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const i = nearestPointIndex(layout.points, x);
    setActive(i >= 0 ? i : null);
  };

  const last = layout.points[layout.points.length - 1];
  const summary = last ? `${label}: ${formatValue(last.value)} — ${formatDate(last.date)}` : label;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <svg
        className={styles.svg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      >
        <title id={titleId}>{summary}</title>
        <g aria-hidden="true">
          {layout.yTicks.map((tick) => (
            <g key={tick.value}>
              <line className={styles.grid} x1={layout.plot.left} x2={layout.plot.right} y1={tick.y} y2={tick.y} />
              <text className={styles.tick} x={layout.yLabelX} y={tick.y} dy="0.35em" textAnchor={layout.yLabelAnchor} direction="ltr">
                {formatValue(tick.value)}
              </text>
            </g>
          ))}
          {layout.xTicks.map((tick, i) => (
            <text
              key={tick.date}
              className={styles.tick}
              x={tick.x}
              y={height - 8}
              textAnchor={layout.xTicks.length === 1 ? 'middle' : i === 0 ? (rtl ? 'end' : 'start') : i === layout.xTicks.length - 1 ? (rtl ? 'start' : 'end') : 'middle'}
            >
              {formatDate(tick.date)}
            </text>
          ))}
          {layout.path && <path className={styles.line} d={layout.path} />}
          {point && <line className={styles.cross} x1={point.x} x2={point.x} y1={layout.plot.top} y2={layout.plot.bottom} />}
          {layout.points.map((p, i) => (
            <circle key={p.date} className={i === active ? styles.dotActive : styles.dot} cx={p.x} cy={p.y} r={i === active ? 6 : 4} />
          ))}
        </g>
      </svg>
      {point && (
        <p className={styles.readout} aria-live="polite">
          <bdi className="num">{formatValue(point.value)}</bdi>
          <span>{formatDate(point.date)}</span>
        </p>
      )}
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{dateHeader}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {layout.points.map((p) => (
            <tr key={p.date}>
              <td>{formatDate(p.date)}</td>
              <td>{formatValue(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
