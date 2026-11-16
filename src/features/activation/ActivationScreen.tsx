import { useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { t } from '@/i18n';
import { formatActivationCodeInput, isCompleteActivationCode } from '@/services/activation/codeFormat';
import type { ActivationError, ActivationState } from '@/services/activation/types';
import { Button, TextField } from '@/ui';
import styles from './ActivationScreen.module.css';

export function ActivationScreen({ onActivated }: { onActivated: (state: ActivationState) => void | Promise<void> }) {
  const { activation } = useServices();
  const [code, setCode] = useState('');
  const [error, setError] = useState<ActivationError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isCompleteActivationCode(code)) {
      setError('malformed');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await activation.activate(code);
    if (result.ok) {
      await onActivated(result.state);
    } else {
      setError(result.error);
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('activation.title')}</h1>
      <p className={styles.lead}>{t('activation.lead')}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t('activation.codeLabel')}
          hint={t('activation.codeHint')}
          error={error ? t(`activation.errors.${error}`) : null}
          value={code}
          onChange={(e) => {
            setCode(formatActivationCodeInput(e.target.value));
            setError(null);
          }}
          placeholder="XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={14}
          ltr
        />
        <Button type="submit" block disabled={busy}>
          {busy ? t('activation.working') : t('activation.submit')}
        </Button>
      </form>
    </main>
  );
}
