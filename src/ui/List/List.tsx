import type { ReactNode } from 'react';
import styles from './List.module.css';

export interface ListSectionProps {
  title?: string;
  footer?: string;
  children: ReactNode;
  /** Header action (e.g. "add"), shown at the inline end of the title. */
  action?: ReactNode;
}

/** Inset grouped list section: optional title, rows separated by hairlines, optional footer. */
export function ListSection({ title, footer, children, action }: ListSectionProps) {
  return (
    <section className={styles.section}>
      {(title || action) && (
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action}
        </div>
      )}
      <div className={styles.group}>{children}</div>
      {footer && <p className={styles.footer}>{footer}</p>}
    </section>
  );
}
