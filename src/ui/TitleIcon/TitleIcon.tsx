import { Icon, type IconName } from '../icons/Icon';
import styles from './TitleIcon.module.css';

/**
 * The filled icon that starts every section and card title: a quiet inline glyph in brand ink (editorial), sized
 * in em so it follows the heading's font.
 */
export function TitleIcon({ name }: { name: IconName }) {
  return (
    <span className={styles.tile}>
      <Icon name={name} />
    </span>
  );
}
