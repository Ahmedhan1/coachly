import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import styles from './Chip.module.css';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> {
  /** Toggle chips pass their state (dark fill when on); action chips leave it out. */
  pressed?: boolean;
  /** warn = a caution choice (injuries): amber fill when on. */
  tone?: 'neutral' | 'warn';
  children: ReactNode;
}

/** The one chip: filter/choice toggles and small inline actions. 36pt visual, 44pt hit area. */
export function Chip({ pressed, tone = 'neutral', className, children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={pressed} className={cx(styles.chip, tone === 'warn' && styles.warn, className)} {...rest}>
      {children}
    </button>
  );
}

/** A titled, wrapping group of chips. */
export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = `chips-${label.replace(/\s+/g, '-')}`;
  return (
    <section className={styles.group} aria-labelledby={id}>
      <h3 id={id} className={styles.label}>
        {label}
      </h3>
      <div className={styles.chips}>{children}</div>
    </section>
  );
}
