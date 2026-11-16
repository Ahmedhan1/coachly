import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { focusableIn, trapTab } from './focusTrap';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Header start button (usually "cancel"). */
  cancelLabel: string;
  /** Header end action — kept at the top so the iOS keyboard never covers it. */
  primaryAction?: ReactNode;
  children: ReactNode;
  /** Element id inside the sheet to focus first; defaults to the first focusable field. */
  initialFocusId?: string;
}

/**
 * Bottom sheet: slides up, traps focus, closes on backdrop tap and Escape, restores focus on close,
 * and makes the rest of the app inert while open.
 */
export function Sheet({ open, onClose, title, cancelLabel, primaryAction, children, initialFocusId }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById('root');
    appRoot?.setAttribute('inert', '');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const initial = (initialFocusId && document.getElementById(initialFocusId)) || focusableIn(panel).find((el) => el.tagName === 'INPUT');
    (initial ?? panel).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      trapTab(event, panel);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      appRoot?.removeAttribute('inert');
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocusId]);

  if (!open) return null;
  return createPortal(
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={onClose} data-testid="sheet-backdrop" />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.header}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {cancelLabel}
          </button>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div className={styles.action}>{primaryAction}</div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
