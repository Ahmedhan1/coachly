import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { cx } from '../cx';
import { hereOf } from '../nav/fromState';
import styles from './ListRow.module.css';

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Makes the row a link with a forward chevron. */
  to?: string;
  onClick?: () => void;
  className?: string;
  /** Link rows remember the current screen (`state.from`) so the target's back button returns here. */
  keepFrom?: boolean;
}

/** One line of an iOS grouped list. Becomes a link or a button when `to`/`onClick` is given. */
export function ListRow({ title, subtitle, leading, trailing, to, onClick, className, keepFrom = true }: ListRowProps) {
  const location = useLocation();
  const content = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
      {(to || onClick) && <Icon name="chevronForward" className={styles.chevron} />}
    </>
  );
  if (to) {
    return (
      <Link to={to} state={keepFrom ? { from: hereOf(location) } : undefined} className={cx(styles.row, styles.interactive, className)}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(styles.row, styles.interactive, className)}>
        {content}
      </button>
    );
  }
  return <div className={cx(styles.row, className)}>{content}</div>;
}
