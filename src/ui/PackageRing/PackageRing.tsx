import { ringSegments } from './ringSegments';
import styles from './PackageRing.module.css';

export interface PackageRingProps {
  total: number;
  remaining: number;
  /** Accessible summary, e.g. "5 حصص باقية من 12". */
  label: string;
  /** Caption under the big number. */
  caption: string;
}

/** Remaining = brand (what the client still has), used = the neutral ring track. */
const STROKE = { left: 'var(--brand)', used: 'var(--ring-left)' } as const;

/**
 * 12-segment package ring (docs/DESIGN.md §5). The brand arc is what is LEFT: it starts at 12 o'clock and runs
 * counter-clockwise (right-to-left across the top, the RTL reading direction); used sessions fall back to
 * the neutral `--ring-left` track, so the arc visibly shrinks as sessions are attended.
 */
export function PackageRing({ total, remaining, label, caption }: PackageRingProps) {
  const segments = ringSegments(total, remaining);
  return (
    <div className={styles.ring} role="img" aria-label={label}>
      <svg viewBox="0 0 104 104" aria-hidden="true" className={styles.svg}>
        <g fill="none" strokeWidth="9">
          {segments.map((state, i) => (
            <circle
              key={i}
              cx="52"
              cy="52"
              r="44"
              pathLength="120"
              stroke={STROKE[state]}
              strokeDasharray="8.6 111.4"
              strokeDashoffset={-10 * i}
              data-state={state}
            />
          ))}
        </g>
      </svg>
      <div className={styles.center} aria-hidden="true">
        <bdi className={`num ${styles.value}`}>{Math.max(remaining, 0)}</bdi>
        <small className={styles.caption}>{caption}</small>
      </div>
    </div>
  );
}
