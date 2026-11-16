import { useId, type SelectHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import styles from './Select.module.css';

export interface SelectProps<V extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (value: V) => void;
}

/** Native select (opens the iOS wheel picker), styled to match TextField. */
export function Select<V extends string>({ label, options, value, onChange, id, ...rest }: SelectProps<V>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <div className={styles.wrap}>
        <select
          id={selectId}
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value as V)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className={styles.chevron} />
      </div>
    </div>
  );
}
