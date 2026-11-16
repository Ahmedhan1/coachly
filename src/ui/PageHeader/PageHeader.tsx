import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Back link (target + accessible label). */
  back?: { to: string; label: string };
  actions?: ReactNode;
}

/** Large-title page header. Pads for the status bar safe area. */
export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {(back || actions) && (
        <div className={styles.bar}>
          {back ? (
            <Link to={back.to} className={styles.back}>
              <Icon name="chevronBack" />
              <span>{back.label}</span>
            </Link>
          ) : (
            <span />
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
