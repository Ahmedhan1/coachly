import { useId, useState } from 'react';
import { t } from '@/i18n';
import { Icon, cx } from '@/ui';
import { Glyph } from './glyphs';
import styles from './Shared.module.css';

export interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  /** Unit shown after the value, outside the LTR isolate. */
  unit?: string;
  /** big = session mode (one-handed, 64pt buttons). */
  size?: 'regular' | 'big';
  decimals?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  testId?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** − value + stepper with a typeable value in the middle (numeric keyboard). */
export function Stepper({ label, value, onChange, step, min = 0, max = 1000, unit, size = 'regular', decimals, decreaseLabel, increaseLabel, testId }: StepperProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const set = (n: number) => onChange(clamp(Math.round(n * 100) / 100, min, max));
  return (
    <div className={cx(styles.stepper, size === 'big' && styles.stepperBig)} data-testid={testId}>
      <label htmlFor={id} className={styles.stepperLabel}>
        {label}
      </label>
      <div className={styles.stepperRow}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={decreaseLabel ?? t('training.programs.editor.decrease', { label })}
          disabled={value <= min}
          onClick={() => set(value - step)}
        >
          <Glyph name="minus" />
        </button>
        <span className={styles.stepValue}>
          <input
            id={id}
            className={cx(styles.stepInput, 'num')}
            type="text"
            inputMode={decimals ? 'decimal' : 'numeric'}
            dir="ltr"
            value={draft ?? String(value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const text = e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(',', '.').replace(/[^\d.]/g, '');
              setDraft(text);
              const n = Number(text);
              if (text !== '' && Number.isFinite(n)) set(n);
            }}
          />
          {unit && <span className={styles.stepUnit}>{unit}</span>}
        </span>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label={increaseLabel ?? t('training.programs.editor.increase', { label })}
          disabled={value >= max}
          onClick={() => set(value + step)}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
