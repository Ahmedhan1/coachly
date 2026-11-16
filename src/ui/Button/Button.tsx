import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', icon, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(styles.button, styles[variant], block && styles.block, className)} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}
