import { ICON_PATHS, MIRRORED, type IconName } from './paths';
import styles from './Icon.module.css';

export interface IconProps {
  name: IconName;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
  className?: string;
}

export function Icon({ name, label, className }: IconProps) {
  const classes = [styles.icon, MIRRORED.has(name) ? styles.mirror : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export type { IconName };
