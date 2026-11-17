import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { Sheet, cx } from '@/ui';
import styles from './Shared.module.css';

export interface SheetAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** iOS-style action list in a bottom sheet. */
export function ActionSheet({ open, title, onClose, actions }: { open: boolean; title: string; onClose: () => void; actions: readonly SheetAction[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} cancelLabel={t('common.close')}>
      <ul className={styles.actionList}>
        {actions.map((a) => (
          <li key={a.key}>
            <button type="button" className={cx(styles.actionRow, a.danger && styles.danger)} disabled={a.disabled} onClick={a.onSelect}>
              {a.icon}
              <span>{a.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
