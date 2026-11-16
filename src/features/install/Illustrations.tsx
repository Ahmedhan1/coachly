import styles from './Illustrations.module.css';

/** Simple line drawings of the iOS steps. Colors come from tokens via CSS classes. */

export function SafariBarIllustration({ label }: { label: string }) {
  return (
    <svg className={styles.art} viewBox="0 0 240 120" role="img" aria-label={label}>
      <rect className={styles.device} x="20" y="8" width="200" height="104" rx="14" />
      <rect className={styles.screen} x="30" y="18" width="180" height="56" rx="6" />
      <rect className={styles.bar} x="30" y="80" width="180" height="24" rx="6" />
      <path className={styles.muted} d="M48 92l-5 0M52 87l-5 5 5 5M188 87l5 5-5 5" />
      <circle className={styles.focus} cx="120" cy="92" r="15" />
      <path className={styles.icon} d="M120 83v11M116 87l4-4 4 4M114.5 90h-2v9.5h15V90h-2" />
    </svg>
  );
}

export function ShareSheetIllustration({ label }: { label: string }) {
  return (
    <svg className={styles.art} viewBox="0 0 240 120" role="img" aria-label={label}>
      <rect className={styles.device} x="20" y="8" width="200" height="104" rx="14" />
      <rect className={styles.screen} x="30" y="18" width="180" height="20" rx="6" />
      <rect className={styles.bar} x="30" y="44" width="180" height="20" rx="5" />
      <rect className={styles.highlight} x="30" y="68" width="180" height="22" rx="5" />
      <rect className={styles.bar} x="30" y="94" width="180" height="10" rx="4" />
      <path className={styles.icon} d="M42 72.5h13v13H42zM48.5 75.5v7M45 79h7" />
      <path className={styles.lineStrong} d="M190 79h-110" />
      <path className={styles.muted} d="M190 54h-90M43 54h10" />
    </svg>
  );
}

export function HomeScreenIllustration({ label, mark }: { label: string; mark: string }) {
  return (
    <svg className={styles.art} viewBox="0 0 240 120" role="img" aria-label={label}>
      <rect className={styles.device} x="20" y="8" width="200" height="104" rx="14" />
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => {
          const x = 44 + col * 42;
          const y = 22 + row * 42;
          const isApp = col === 1 && row === 1;
          return isApp ? (
            <g key={`${col}-${row}`}>
              <rect className={styles.appIcon} x={x} y={y} width="28" height="28" rx="7" />
              <text className={styles.appMark} x={x + 14} y={y + 19.5} textAnchor="middle">
                {mark}
              </text>
              <circle className={styles.focusRing} cx={x + 14} cy={y + 14} r="20" />
            </g>
          ) : (
            <rect key={`${col}-${row}`} className={styles.bar} x={x} y={y} width="28" height="28" rx="7" />
          );
        }),
      )}
    </svg>
  );
}
