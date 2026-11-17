import type { ReactNode } from 'react';
import { cx } from '@/ui';
import styles from './ChipToggle.module.css';

/** Pill toggle (36pt visual, 44pt hit area). */
export function ChipToggle({ pressed, onToggle, children }: { pressed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} className={cx(styles.chip, pressed && styles.on)} onClick={onToggle}>
      {children}
    </button>
  );
}

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
