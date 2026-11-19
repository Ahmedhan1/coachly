import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import { Icon } from '../icons/Icon';
import { fromOf } from '../nav/fromState';
import { cx } from '../cx';
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
  /** Title of the compact bar that fades in once the large title scrolls away (iOS). Default: `title`. */
  compactTitle?: string;
  /** Element whose scrolling away shows the compact bar, when the large title is outside this header. */
  watch?: RefObject<HTMLElement | null>;
}

/** True once `target` has scrolled up past the top edge (not when it is below the viewport). */
function useScrolledPast(target: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return past;
}

const pathOf = (to: string) => to.split('?')[0] ?? to;

/**
 * Large Alexandria title, start-aligned, with round 44pt buttons. Pads for the status bar safe area.
 * When the large title scrolls away, a translucent compact bar with the title (and back) fades in at the top,
 * like an iOS navigation bar. The compact bar repeats what is already in the page, so it is hidden from
 * assistive tech and the keyboard.
 */
export function PageHeader({ title, subtitle, back, actions, compactTitle, watch }: PageHeaderProps) {
  const own = useRef<HTMLHeadingElement | null>(null);
  const past = useScrolledPast(watch ?? own);
  const small = compactTitle ?? title;
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
      {small && (
        <div className={cx(styles.compact, past && styles.compactOn)} aria-hidden="true">
          {back ? (
            <Link to={target} className={styles.compactBack} tabIndex={-1} onClick={onBack}>
              <Icon name="chevronBack" />
            </Link>
          ) : (
            <span />
          )}
          <span className={styles.compactTitle}>{small}</span>
          <span />
        </div>
      )}
      {back ? (
        <>
          <div className={styles.bar}>
            <Link to={target} className={styles.back} aria-label={label} title={label} onClick={onBack}>
              <Icon name="chevronBack" />
            </Link>
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
          {title && (
            <h1 ref={own} className={styles.title}>
              {title}
            </h1>
          )}
        </>
      ) : (
        <div className={styles.top}>
          <h1 ref={own} className={styles.title}>
            {title}
          </h1>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
