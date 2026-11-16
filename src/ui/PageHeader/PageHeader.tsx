import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Back link (target + accessible label). Pushed screens get a round back button on the start side. */
  back?: { to: string; label: string };
  actions?: ReactNode;
}

/** Large Alexandria title, start-aligned, with round 44pt buttons. Pads for the status bar safe area. */
export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back ? (
        <>
          <div className={styles.bar}>
            <Link to={back.to} className={styles.back} aria-label={back.label} title={back.label}>
              <Icon name="chevronBack" />
            </Link>
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
          {title && <h1 className={styles.title}>{title}</h1>}
        </>
      ) : (
        <div className={styles.top}>
          <h1 className={styles.title}>{title}</h1>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
