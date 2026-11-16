import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  /** round = 44pt circle on --surface (top bars); muted = on --surface-2 (inside tiles); brand = brand fill. */
  tone?: 'round' | 'muted' | 'brand';
}

export function IconButton({ icon, label, tone = 'round', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(styles.iconButton, styles[tone], className)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
