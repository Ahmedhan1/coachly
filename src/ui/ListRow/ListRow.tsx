import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { cx } from '../cx';
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
}

/** One line of an iOS grouped list. Becomes a link or a button when `to`/`onClick` is given. */
export function ListRow({ title, subtitle, leading, trailing, to, onClick, className }: ListRowProps) {
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
      <Link to={to} className={cx(styles.row, styles.interactive, className)}>
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
