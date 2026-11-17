import { layoutLineChart, type DatedValue } from '@/domain/charts';
import { t } from '@/i18n';
import { formatIsoDate, formatNumber } from '@/ui/format';
import styles from './Progress.module.css';

const BOX = { width: 340, height: 180, padTop: 12, padBottom: 26, padStart: 36, padEnd: 10, rtl: true } as const;

/** Weight over time as a single line (RTL: oldest on the right). Pure layout comes from domain/charts. */
export function WeightChart({ series, label }: { series: readonly DatedValue[]; label?: string }) {
  const chart = layoutLineChart(series, BOX);
  const first = chart.points[0];
  const last = chart.points[chart.points.length - 1];
  if (!first || !last) return null;
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      role="img"
      aria-label={label ?? t('nutrition.progress.chartLabel', { from: formatIsoDate(first.date), to: formatIsoDate(last.date) })}
    >
      {chart.yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={chart.plot.left} x2={chart.plot.right} y1={tick.y} y2={tick.y} className={styles.grid} />
          <text x={chart.yLabelX} y={tick.y + 4} textAnchor={chart.yLabelAnchor} className={styles.axis}>
            {formatNumber(tick.value)}
          </text>
        </g>
      ))}
      {chart.xTicks.map((tick) => (
        <text key={tick.date} x={tick.x} y={BOX.height - 6} textAnchor="middle" className={styles.axis}>
          {formatIsoDate(tick.date)}
        </text>
      ))}
      <path d={chart.path} className={styles.line} />
      {chart.points.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r={p === last ? 4.5 : 3} className={p === last ? styles.dotLast : styles.dot} />
      ))}
    </svg>
  );
}
