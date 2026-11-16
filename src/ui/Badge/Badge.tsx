import type { ReactNode } from 'react';
import { cx } from '../cx';
import styles from './Badge.module.css';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning' | 'danger' | 'brand'; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
