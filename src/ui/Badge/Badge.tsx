import type { ReactNode } from 'react';
import { cx } from '../cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'warning' | 'danger' | 'brand' | 'ok';

/** Direction B chip: 28px pill on a tint; numbers inside use <Num>. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
