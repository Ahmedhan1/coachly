import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** onBrand = inverse button sitting on a brand block (hero). */
  variant?: 'primary' | 'secondary' | 'plain' | 'danger' | 'onBrand';
  size?: 'regular' | 'small' | 'large';
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'regular', icon, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}
