import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  /** Tell the trainer what to do next, not just that it is empty. */
  body: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Icon name={icon} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
