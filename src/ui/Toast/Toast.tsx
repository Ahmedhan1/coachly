import { useEffect } from 'react';
import { Icon } from '../icons/Icon';
import styles from './Toast.module.css';

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss. */
  duration?: number;
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration ?? 5000);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);
  return (
    <div className={styles.toast}>
      <p className={styles.message}>{toast.message}</p>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
        >
          <Icon name="undo" />
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}

/** Stack of toasts above the tab bar. Live region so screen readers announce them. */
export function ToastHost({ toasts, onDismiss }: { toasts: readonly ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastView key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
