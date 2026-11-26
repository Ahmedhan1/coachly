import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './FileButton.module.css';

export interface FileButtonProps {
  children: ReactNode;
  /** Called with the picked files; the input is cleared so the same file can be picked again. */
  onFiles: (files: File[]) => void;
  icon?: IconName;
  accept?: string;
  multiple?: boolean;
  /** Disables the picker and marks it busy (processing a previous pick). */
  busy?: boolean;
  block?: boolean;
  className?: string;
}

/** The one "pick a file / photo" button: a label wrapping a hidden file input (iOS opens the picker on tap). */
export function FileButton({ children, onFiles, icon, accept, multiple, busy, block, className }: FileButtonProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx(styles.button, block && styles.block, className)} aria-busy={busy || undefined}>
      {icon && <Icon name={icon} />}
      <span className={styles.text}>{children}</span>
      <input
        id={id}
        type="file"
        className="visually-hidden"
        accept={accept}
        multiple={multiple}
        disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}
