import { useState } from 'react';
import type { NutritionSettings } from '@/domain/meals';
import { navyBodyFat, type Sex } from '@/domain/nutrition';
import { t } from '@/i18n';
import { Button, Icon, Num, TextField } from '@/ui';
import { navyErrorText } from '../shared/errors';
import { fieldText, oneDecimal, parseDecimal } from '../shared/numbers';
import common from '../shared/common.module.css';
import styles from './Calculator.module.css';

interface NavyHelperProps {
  sex: Sex;
  heightCm: number;
  waistCm: number | undefined;
  hipCm: number | undefined;
  navy: NutritionSettings['navy'];
  limits: NutritionSettings['limits'];
  onUse: (bodyFatPercent: number) => void;
}

/** Optional US Navy body-fat estimate from tape measurements. */
export function NavyHelper({ sex, heightCm, waistCm, hipCm, navy, limits, onUse }: NavyHelperProps) {
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState(fieldText(waistCm));
  const [hip, setHip] = useState(fieldText(hipCm));
  const touched = neck.trim() !== '' && waist.trim() !== '';
  const result = touched
    ? navyBodyFat({ sex, heightCm, neckCm: parseDecimal(neck), waistCm: parseDecimal(waist), hipCm: sex === 'female' ? parseDecimal(hip) : null }, navy, limits)
    : null;
  return (
    <details className={`${common.disclosure} ${styles.navy}`}>
      <summary>
        {t('nutrition.navy.title')}
        <Icon name="chevronDown" />
      </summary>
      <div className={common.disclosureBody}>
        <p className={common.caption}>{t('nutrition.navy.hint')}</p>
        <div className={common.grid2}>
          <TextField label={t('nutrition.navy.neck')} inputMode="decimal" ltr value={neck} onChange={(e) => setNeck(e.target.value)} />
          <TextField label={t('nutrition.navy.waist')} inputMode="decimal" ltr value={waist} onChange={(e) => setWaist(e.target.value)} />
          {sex === 'female' && <TextField label={t('nutrition.navy.hip')} inputMode="decimal" ltr value={hip} onChange={(e) => setHip(e.target.value)} />}
        </div>
        {result && !result.ok && <p className={common.error}>{navyErrorText(result.error)}</p>}
        {result && result.ok && (
          <div className={styles.navyResult}>
            <p>
              {t('nutrition.navy.result')} <Num>{oneDecimal(result.value)}</Num>%
            </p>
            <Button icon="check" size="small" variant="secondary" onClick={() => onUse(result.value)}>
              {t('nutrition.navy.use')}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
