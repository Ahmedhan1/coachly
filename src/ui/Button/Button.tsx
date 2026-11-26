import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * onBrand = inverse button sitting on a brand block (hero). plain = tinted pill (never a ghost text button).
   * outline = white pill with a border, for "continue with <provider>" (pass the provider's logo as `leading`).
   * danger = red text action (destructive, e.g. "remove from team").
   */
  variant?: 'primary' | 'secondary' | 'plain' | 'danger' | 'onBrand' | 'outline';
  size?: 'regular' | 'small' | 'large';
  icon?: IconName;
  /** A custom glyph instead of `icon`, e.g. a provider's own logo (keeps its colours). */
  leading?: ReactNode;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'regular', icon, leading, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)} {...rest}>
      {leading ? (
        <span className={styles.leading} aria-hidden="true">
          {leading}
        </span>
      ) : (
        icon && <Icon name={icon} />
      )}
      <span>{children}</span>
    </button>
  );
}
