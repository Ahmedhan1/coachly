import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons/Icon';
import { TitleIcon } from '../TitleIcon/TitleIcon';
import styles from './List.module.css';

export interface ListSectionProps {
  title?: string;
  /** Filled icon in a tinted tile before the title. */
  icon?: IconName;
  /** Small count pill after the title (e.g. how many subscriptions end soon). */
  count?: number;
  footer?: string;
  children: ReactNode;
  /** Header action (e.g. a link), shown at the inline end of the title. */
  action?: ReactNode;
  /** Render the children without the tile (e.g. a custom tile layout). */
  bare?: boolean;
  className?: string;
  /** Accessible name when there is no visible title. */
  label?: string;
}

/** Direction B section: Alexandria title + rows grouped in a rounded tile on --bg. */
export function ListSection({ title, icon, count, footer, children, action, bare, className, label }: ListSectionProps) {
  return (
    <section className={cx(styles.section, className)} aria-label={title ? undefined : label}>
      {(title || action) && (
        <div className={styles.header}>
          {title && (
            <h2 className={styles.title}>
              {icon && <TitleIcon name={icon} />}
              {title}
              {count !== undefined && <bdi className={cx('num', styles.count)}>{count}</bdi>}
            </h2>
          )}
          {action}
        </div>
      )}
      {bare ? children : <div className={styles.tile}>{children}</div>}
      {footer && (
        <p className={styles.footer}>
          <Icon name="info" />
          <span>{footer}</span>
        </p>
      )}
    </section>
  );
}

/** Text link in a section header ("المواعيد", "جدّد"). */
export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={styles.link} onClick={onClick}>
      <span>{children}</span>
      <Icon name="chevronForward" />
    </button>
  );
}
