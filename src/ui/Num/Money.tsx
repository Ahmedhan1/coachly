import { currencyLabel, formatAmount } from '../format';
import { Num } from './Num';

/** "2,400 ج.م" with the amount isolated LTR and the currency outside the isolate. */
export function Money({ minor, currency, className }: { minor: number; currency: string; className?: string }) {
  return (
    <span className={className}>
      <Num>{formatAmount(minor)}</Num> {currencyLabel(currency)}
    </span>
  );
}
