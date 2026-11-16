import { useId } from 'react';
import { cx } from '../cx';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Wrap onto several rows when there are many options. */
  wrap?: boolean;
}

/** iOS-style segmented control, implemented as a native radio group (keyboard + screen reader friendly). */
export function SegmentedControl<V extends string>({ label, options, value, onChange, wrap }: SegmentedControlProps<V>) {
  const name = useId();
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{label}</legend>
      <div className={cx(styles.track, wrap && styles.wrap)}>
        {options.map((o) => (
          <label key={o.value} className={cx(styles.segment, o.value === value && styles.selected)}>
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
