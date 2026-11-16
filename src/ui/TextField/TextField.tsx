import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cx } from '../cx';
import styles from './TextField.module.css';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Content that is Latin/digits (codes, phone numbers) is laid out LTR. */
  ltr?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, ltr, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={cx(styles.input, ltr && styles.ltr, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        dir={ltr ? 'ltr' : undefined}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
