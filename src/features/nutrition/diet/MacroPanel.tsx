import { useState, type ReactNode } from 'react';
import { convertAmount, type KcalPerGramLike, type MacroAmount, type MacroSpec, type MacroTargets, type MacroUnit } from '@/domain/meals';
import { t } from '@/i18n';
import { SegmentedControl, Tx } from '@/ui';
import { parseDecimal } from '../shared/numbers';
import styles from './Cal.module.css';
import diet from './Diet.module.css';

type MacroKey = 'protein' | 'fat' | 'carb';
const UNITS: Record<MacroKey, readonly MacroUnit[]> = { protein: ['perKg', 'grams'], fat: ['perKg', 'percent', 'grams'], carb: ['grams', 'perKg', 'percent'] };
const STEP: Record<MacroUnit, number> = { perKg: 0.1, grams: 5, percent: 1 };
const KCAL_KEY: Record<MacroKey, keyof KcalPerGramLike> = { protein: 'protein', fat: 'fat', carb: 'carb' };
const GRAMS_KEY: Record<MacroKey, 'proteinG' | 'fatG' | 'carbG'> = { protein: 'proteinG', fat: 'fatG', carb: 'carbG' };

const show = (a: MacroAmount) => (a.unit === 'perKg' ? String(Math.round(a.value * 10) / 10) : String(Math.round(a.value)));

interface Props {
  spec: MacroSpec;
  targets: MacroTargets;
  weightKg: number;
  kpg: KcalPerGramLike;
  onChange: (spec: MacroSpec) => void;
}

/** Protein + (fat or carbs) set by the trainer in g/kg, grams or %, the third macro takes what is left. */
export function MacroPanel({ spec, targets, weightKg, kpg, onChange }: Props) {
  const setKey = (key: MacroKey, a: MacroAmount) => onChange({ ...spec, [key]: { unit: a.unit, value: Math.max(0, a.value) } });
  const setUnit = (key: MacroKey, unit: MacroUnit) => setKey(key, convertAmount(spec[key], unit, targets.kcal, weightKg, kpg[KCAL_KEY[key]]));
  const set: MacroKey = spec.rest === 'carb' ? 'fat' : 'carb';
  const rest: MacroKey = spec.rest;
  const line = (key: MacroKey) => {
    const g = targets[GRAMS_KEY[key]];
    const kcal = g * kpg[KCAL_KEY[key]];
    return <Tx k="nutrition.cal.macroLine" params={{ g: Math.round(g), kcal: Math.round(kcal), pct: targets.kcal > 0 ? Math.round((kcal / targets.kcal) * 100) : 0 }} />;
  };
  return (
    <div className={styles.panel}>
      <p className={diet.intro}>{t('nutrition.cal.macroHint')}</p>
      <MacroRow name={t('nutrition.cal.macro.protein')} amount={spec.protein} units={UNITS.protein} sub={line('protein')} onSet={(a) => setKey('protein', a)} onUnit={(u) => setUnit('protein', u)} />
      <SegmentedControl
        label={t('nutrition.cal.restTitle')}
        options={(['carb', 'fat'] as const).map((r) => ({ value: r, label: t(`nutrition.cal.rest.${r}`) }))}
        value={spec.rest}
        onChange={(r) => onChange({ ...spec, rest: r })}
      />
      <MacroRow name={t(`nutrition.cal.macro.${set}`)} amount={spec[set]} units={UNITS[set]} sub={line(set)} onSet={(a) => setKey(set, a)} onUnit={(u) => setUnit(set, u)} />
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <p className={styles.rowName}>{t('nutrition.cal.restIs', { name: t(`nutrition.cal.macro.${rest}`) })}</p>
          <p className={styles.rowSub}>{line(rest)}</p>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  name: string;
  amount: MacroAmount;
  units: readonly MacroUnit[];
  sub: ReactNode;
  onSet: (a: MacroAmount) => void;
  onUnit: (u: MacroUnit) => void;
}

function MacroRow({ name, amount, units, sub, onSet, onUnit }: RowProps) {
  const [text, setText] = useState<string | null>(null);
  const step = STEP[amount.unit];
  const bump = (d: number) => onSet({ unit: amount.unit, value: Math.round(Math.round((amount.value + d) / step) * step * 100) / 100 });
  const commit = () => {
    if (text === null) return;
    const n = parseDecimal(text);
    setText(null);
    if (Number.isFinite(n) && n >= 0) onSet({ unit: amount.unit, value: n });
  };
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <p className={styles.rowName}>{name}</p>
        <p className={styles.rowSub}>{sub}</p>
      </div>
      <div className={styles.controls}>
        <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.less', { name })} onClick={() => bump(-step)}>
          −
        </button>
        <input
          className={`${styles.value} num`}
          inputMode="decimal"
          aria-label={t('nutrition.cal.field', { name })}
          value={text ?? show(amount)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <button type="button" className={diet.stepBtn} aria-label={t('nutrition.cal.more', { name })} onClick={() => bump(step)}>
          +
        </button>
      </div>
      <div className={styles.unitRow} role="group" aria-label={t('nutrition.cal.unitPick', { name })}>
        {units.map((u) => (
          <button key={u} type="button" className={styles.chip} aria-pressed={u === amount.unit} onClick={() => u !== amount.unit && onUnit(u)}>
            {t(`nutrition.cal.unit.${u}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
