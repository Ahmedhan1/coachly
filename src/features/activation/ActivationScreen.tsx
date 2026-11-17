import { useEffect, useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { getLocale, setLocale, t } from '@/i18n';
import { formatActivationCodeInput, isCompleteActivationCode } from '@/services/activation/codeFormat';
import type { ActivationError, ActivationState, LockReason } from '@/services/activation/types';
import { Button, Icon, TextArea, TextField } from '@/ui';
import { OFFLINE_CODE_PREFIX } from '../../../shared/license';
import { checkForAppUpdate, setReloadSafe } from '@/app/appUpdate';
import { DeviceIdCard } from './DeviceIdCard';
import styles from './ActivationScreen.module.css';

type Mode = 'short' | 'long';
type FormError = ActivationError | 'malformedLong';

export interface ActivationScreenProps {
  /** Why an already activated app is locked (expired, revoked, clock), or null on first activation. */
  locked?: LockReason | null;
  onActivated: (state: ActivationState) => void | Promise<void>;
}

export function ActivationScreen({ locked = null, onActivated }: ActivationScreenProps) {
  const { activation } = useServices();
  const [mode, setMode] = useState<Mode>('short');
  const [code, setCode] = useState('');
  const [longCode, setLongCode] = useState('');
  const [error, setError] = useState<FormError | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Nothing to lose on this screen: let a newer app version replace this one immediately.
  useEffect(() => {
    setReloadSafe(true);
    void checkForAppUpdate();
    return () => setReloadSafe(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void activation.getDeviceId().then((id) => !cancelled && setDeviceId(id));
    return () => {
      cancelled = true;
    };
  }, [activation]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'short' && !isCompleteActivationCode(code)) return setError('malformed');
    if (mode === 'long' && !longCode.replace(/\s+/g, '').startsWith(OFFLINE_CODE_PREFIX)) return setError('malformedLong');
    setBusy(true);
    setError(null);
    setDetail(null);
    const result = await activation.activate(mode === 'short' ? code : longCode);
    if (result.ok) {
      await onActivated(result.state);
    } else {
      setError(result.error);
      setDetail(result.detail ?? null);
      setBusy(false);
      // A network/server failure may mean this phone still runs an old cached build: look for a new one.
      if (result.error === 'offline' || result.error === 'unavailable') void checkForAppUpdate();
    }
  };

  const message = error ? (error === 'malformedLong' ? t('activation.errors.malformedLong') : t(`activation.errors.${error}`)) : null;

  return (
    <main className={styles.page}>
      <div className={styles.langRow}>
        <button
          type="button"
          className={styles.langToggle}
          lang={getLocale() === 'en' ? 'ar' : 'en'}
          aria-label={t('settings.language.title')}
          data-testid="activation-language"
          onClick={() => setLocale(getLocale() === 'en' ? 'ar' : 'en')}
        >
          <Icon name="globe" />
          {getLocale() === 'en' ? t('settings.language.ar') : t('settings.language.en')}
        </button>
      </div>
      <span className={styles.mark} aria-hidden="true">
        {t('app.name').charAt(0)}
      </span>
      <h1 className={styles.title}>{t('activation.title')}</h1>
      <p className={styles.lead}>{t('activation.lead')}</p>

      {locked && (
        <div className={styles.locked} role="alert">
          <Icon name="alert" />
          <div>
            <p className={styles.lockedTitle}>{t('activation.lockedTitle')}</p>
            <p>{t(`activation.locked.${locked}`)}</p>
          </div>
        </div>
      )}

      <form className={styles.form} onSubmit={submit} noValidate>
        {mode === 'short' ? (
          <TextField
            label={t('activation.codeLabel')}
            hint={t('activation.codeHint')}
            error={message}
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
            className={styles.codeField}
            ltr
          />
        ) : (
          <TextArea
            label={t('activation.longLabel')}
            hint={t('activation.longHint')}
            error={message}
            value={longCode}
            onChange={(e) => {
              setLongCode(e.target.value);
              setError(null);
            }}
            placeholder="PT1.…"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            rows={5}
            ltr
          />
        )}
        <Button type="submit" size="large" block disabled={busy}>
          {busy ? t('activation.working') : t('activation.submit')}
        </Button>
        <Button
          variant="plain"
          block
          onClick={() => {
            setMode(mode === 'short' ? 'long' : 'short');
            setError(null);
          }}
        >
          {mode === 'short' ? t('activation.useLong') : t('activation.useShort')}
        </Button>
      </form>

      {detail && (
        <p className={styles.detail} dir="ltr">
          {detail}
        </p>
      )}

      <DeviceIdCard deviceId={deviceId} />
      <p className={styles.build} dir="ltr">
        {import.meta.env.VITE_BUILD_ID ?? 'dev'}
      </p>
    </main>
  );
}
