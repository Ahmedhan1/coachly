import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import { Icon } from '../icons/Icon';
import { fromOf } from '../nav/fromState';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /**
   * Back link (fallback target + accessible label). When the screen was opened from another screen
   * (`state.from`), back returns there instead and `genericLabel` (default «رجوع») names it.
   */
  back?: { to: string; label: string; genericLabel?: string };
  actions?: ReactNode;
}

const pathOf = (to: string) => to.split('?')[0] ?? to;

/** Large Alexandria title, start-aligned, with round 44pt buttons. Pads for the status bar safe area. */
export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const from = back ? fromOf(location) : null;
  const target = from ?? back?.to ?? '/';
  const label = back ? (from === null || pathOf(from) === pathOf(back.to) ? back.label : (back.genericLabel ?? t('common.back'))) : '';
  const onBack = (e: MouseEvent<HTMLAnchorElement>) => {
    if (from === null) return;
    // The previous history entry is `from` itself: pop it so its own back target (state) is kept.
    e.preventDefault();
    navigate(-1);
  };
  return (
    <header className={styles.header}>
      {back ? (
        <>
          <div className={styles.bar}>
            <Link to={target} className={styles.back} aria-label={label} title={label} onClick={onBack}>
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
