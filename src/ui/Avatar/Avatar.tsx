import styles from './Avatar.module.css';

/** First letter of the name, e.g. "سارة محمود" -> "س". Arabic letters do not join well as a pair. */
export function initials(name: string): string {
  return name.trim().charAt(0);
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
