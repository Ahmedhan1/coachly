import { Icon } from '../icons/Icon';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  label: string;
  id?: string;
}

export function SearchField({ value, onChange, placeholder, clearLabel, label, id }: SearchFieldProps) {
  return (
    <div className={styles.wrap} role="search">
      <Icon name="search" className={styles.icon} />
      <input
        type="search"
        id={id}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className={styles.clear} aria-label={clearLabel} onClick={() => onChange('')}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
