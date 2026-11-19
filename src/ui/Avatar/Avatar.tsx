import styles from './Avatar.module.css';

/** First letter of the name, e.g. "سارة محمود" -> "س". Arabic letters do not join well as a pair. */
export function initials(name: string): string {
  return name.trim().charAt(0);
}

/** 44pt square: the person's photo when there is one, otherwise the first letter of their name. */
export function Avatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {src ? <img src={src} alt="" className={styles.photo} draggable={false} /> : initials(name)}
    </span>
  );
}
