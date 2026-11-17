import { useState, type FormEvent, type ReactNode } from 'react';
import { t, type TKey } from '@/i18n';
import { Button, IconButton, Tx } from '@/ui';
import { useIdentityDraft, type IdentityDraft } from './identityDraft';
import { useIconHint } from './IconHint';
import { ColorSection, LogoSection, NameSection, UnitsSection, type SectionProps } from './IdentitySections';
import styles from './Identity.module.css';

interface Step {
  key: 'name' | 'logo' | 'color' | 'units';
  Body: (props: SectionProps) => ReactNode;
}

const STEPS: readonly Step[] = [
  { key: 'name', Body: (p) => <NameSection {...p} autoFocus /> },
  { key: 'logo', Body: LogoSection },
  { key: 'color', Body: ColorSection },
  { key: 'units', Body: UnitsSection },
];

/** First run after activation (SPEC screen 1): 4 short steps, every one skippable, all editable later. */
export function IdentitySetupScreen({ onDone }: { onDone: () => void }) {
  const { draft, update, save } = useIdentityDraft(true);
  const hint = useIconHint(onDone);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const step = STEPS[index] ?? STEPS[0];
  if (!draft || !step) return null;

  const finish = async (value: IdentityDraft) => {
    setSaving(true);
    await save(value);
    if (!(await hint.afterSave())) onDone();
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (index < STEPS.length - 1) setIndex(index + 1);
    else void finish(draft);
  };

  const last = index === STEPS.length - 1;
  const Body = step.Body;
  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        {index > 0 ? (
          <IconButton icon="chevronBack" label={t('common.back')} onClick={() => setIndex(index - 1)} />
        ) : (
          <span />
        )}
        <p className={styles.progress} aria-live="polite">
          <Tx k="identity.stepOf" params={{ n: index + 1, total: STEPS.length }} />
        </p>
        <Button variant="plain" size="small" disabled={saving} onClick={() => void finish(draft)}>
          {t('identity.later')}
        </Button>
      </div>
      <ol className={styles.dots} aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s.key} data-on={i <= index || undefined} />
        ))}
      </ol>

      <form className={styles.form} onSubmit={next} noValidate>
        <h1 className={styles.title}>{t(`identity.${step.key}.title` as TKey)}</h1>
        <p className={styles.lead}>{t(`identity.${step.key}.lead` as TKey)}</p>
        <div className={styles.body} key={step.key}>
          <Body draft={draft} update={update} />
        </div>
        <div className={styles.actions}>
          <p className={styles.later}>{t('identity.editLater')}</p>
          <Button type="submit" size="large" block disabled={saving}>
            {last ? t('identity.finish') : t('common.next')}
          </Button>
        </div>
      </form>
      {hint.sheet}
    </main>
  );
}
