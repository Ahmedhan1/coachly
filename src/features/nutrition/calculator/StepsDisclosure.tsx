import type { CalcStep } from '@/domain/meals';
import { t } from '@/i18n';
import { Icon, Num } from '@/ui';
import { oneDecimal } from '../shared/numbers';
import common from '../shared/common.module.css';
import styles from './Calculator.module.css';

/** "طريقة الحساب": each step with the formula name, the arithmetic with the numbers used, and the result. */
export function StepsDisclosure({ steps }: { steps: readonly CalcStep[] }) {
  return (
    <details className={common.disclosure}>
      <summary>
        {t('nutrition.calc.howTitle')}
        <Icon name="chevronDown" />
      </summary>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id}>
            <p className={styles.stepLabel}>{t(`nutrition.steps.${step.id}`)}</p>
            <p className={styles.stepMath} dir="ltr">
              <bdi className="num">{step.expression}</bdi>
              {' = '}
              <Num>{oneDecimal(step.result)}</Num>
            </p>
          </li>
        ))}
      </ol>
      <p className={styles.stepsNote}>{t('nutrition.calc.howNote')}</p>
    </details>
  );
}
