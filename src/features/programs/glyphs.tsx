import styles from './Shared.module.css';

/** Icons the shared sprite (src/ui/icons) does not have yet; same 24-grid stroke style. */
const PATHS = {
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  swap: 'M7 7.5h12M15.5 4l3.5 3.5-3.5 3.5M17 16.5H5M8.5 13 5 16.5 8.5 20',
  skip: 'M6 6.5v11l8-5.5zM17.5 6.5v11',
  minus: 'M5 12h14',
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      className={[styles.glyph, name === 'grip' ? styles.grip : '', className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
