import { useId } from 'react';
import { Num } from '@/ui';
import styles from './Slider.module.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Rendered value, e.g. "20%" or "2 جم/كجم". */
  display: string;
  unit?: string;
}

/** Native range input (VoiceOver adjustable) with a 44pt thumb area and the value isolated LTR. */
export function Slider({ label, value, min, max, step, onChange, display, unit }: SliderProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <output htmlFor={id} className={styles.value}>
          <Num>{display}</Num>
          {unit && <span className={styles.unit}>{unit}</span>}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={unit ? `${display} ${unit}` : display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className={styles.ends} aria-hidden="true">
        <Num>{min}</Num>
        <Num>{max}</Num>
      </div>
    </div>
  );
}
