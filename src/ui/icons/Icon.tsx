import { ICON_PATHS, ICON_VIEWBOX, MIRRORED, type IconName } from './paths';
import styles from './Icon.module.css';

export interface IconProps {
  name: IconName;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
  className?: string;
}

/** One filled, rounded icon (currentColor). Size comes from CSS: --icon by default. */
export function Icon({ name, label, className }: IconProps) {
  const classes = [styles.icon, MIRRORED.has(name) ? styles.mirror : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      viewBox={ICON_VIEWBOX}
      fill="currentColor"
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
