import { Icon, type IconName } from '../icons/Icon';
import styles from './TitleIcon.module.css';

/**
 * The filled icon in a brand-tinted rounded tile that starts every section and card title. Sized in em, so it
 * follows the heading's font (32px next to a 20px section title, ~27px next to a 17px card title).
 */
export function TitleIcon({ name }: { name: IconName }) {
  return (
    <span className={styles.tile}>
      <Icon name={name} />
    </span>
  );
}
