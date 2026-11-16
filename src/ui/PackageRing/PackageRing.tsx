import { ringSegments } from './ringSegments';
import styles from './PackageRing.module.css';

export interface PackageRingProps {
  total: number;
  remaining: number;
  /** Next session already booked: one brand segment. */
  booked?: boolean;
  /** Accessible summary, e.g. "5 حصص باقية من 12". */
  label: string;
  /** Caption under the big number. */
  caption: string;
}

const STROKE = { used: 'var(--text-3)', booked: 'var(--brand)', left: 'var(--ring-left)' } as const;

/**
 * 12-segment package ring (DESIGN.md §5). Fills counter-clockwise from the top, i.e. right-to-left
 * across the top for an RTL reader: used = --text-3, booked = --brand, left = --ring-left (--surface-2 in light).
 */
export function PackageRing({ total, remaining, booked = false, label, caption }: PackageRingProps) {
  const segments = ringSegments(total, remaining, booked);
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
