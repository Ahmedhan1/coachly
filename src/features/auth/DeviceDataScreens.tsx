import { useState } from 'react';
import { CLOUD_PASSWORD_KEY, useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { t } from '@/i18n';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/services/backup';
import { Button, Icon, TextField } from '@/ui';
import { formatBytes, formatIsoDate } from '@/ui/format';
import { toIsoDate } from '@/domain/models';
import { PHOTOS_TO_RECOVER_KEY } from '@/features/files/photoRecovery';
import { LanguageToggle } from './LanguageToggle';
import styles from './AuthScreen.module.css';

/** The phone holds another account's data: sign out, or erase it and continue with this account. */
export function OtherAccountDataScreen({ onErased, onSignedOut }: { onErased: () => void | Promise<void>; onSignedOut: () => void }) {
  const { auth, data } = useServices();
  const [busy, setBusy] = useState(false);
  return (
    <main className={styles.page}>
      <div className={styles.langRow}>
        <LanguageToggle />
      </div>
      <span className={styles.gateIconOff} aria-hidden="true">
        <Icon name="lock" />
      </span>
      <h1 className={styles.title}>{t('auth.device.otherTitle')}</h1>
      <p className={styles.lead}>{t('auth.device.otherLead')}</p>
      <div className={styles.form}>
        <Button
          icon="logout"
          size="large"
          block
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await auth.signOut();
            onSignedOut();
          }}
        >
          {t('auth.device.otherSignOut')}
        </Button>
        <Button
          variant="danger"
          icon="trash"
          block
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(t('auth.device.otherEraseConfirm'))) return;
            setBusy(true);
            await data.eraseLocalData();
            await onErased();
          }}
          data-testid="erase-device-data"
        >
          {t('auth.device.otherErase')}
        </Button>
      </div>
    </main>
  );
}

/** First sign-in of an account on an empty phone that has a cloud backup: offer to bring the data back. */
export function RestoreOfferScreen({ onSkip }: { onSkip: () => void }) {
  const { backup, meta } = useServices();
  const info = useLive(async () => (backup ? backup.cloud.info() : null), [backup]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const present = info?.ok && info.value !== null ? info.value : null;

  const restore = async () => {
    if (!backup) return;
    setWorking(true);
    setError(null);
    const r = await backup.cloud.restore(password);
    if (!r.ok) {
      setWorking(false);
      return setError(r.error === 'wrong_password' || r.error === 'password_required' ? t('auth.device.wrongPassword') : t('auth.device.failed'));
    }
    // Keep automatic cloud backups going with the same password, and fetch full photos after the reload.
    await meta.set(CLOUD_PASSWORD_KEY, password);
    await meta.set(PHOTOS_TO_RECOVER_KEY, true);
    window.alert(t('auth.device.restoreDone'));
    window.location.replace('/');
  };

  return (
    <main className={styles.page}>
      <div className={styles.langRow}>
        <LanguageToggle />
      </div>
      <span className={styles.gateIcon} aria-hidden="true">
        <Icon name="cloud" />
      </span>
      <h1 className={styles.title}>{t('auth.device.restoreTitle')}</h1>
      <p className={styles.lead}>{t('auth.device.restoreLead')}</p>
      {present && (
        <p className={styles.who}>
          {t('auth.device.restoreInfo', {
            size: formatBytes(present.bytes ?? 0),
            date: present.updatedAt ? formatIsoDate(toIsoDate(new Date(present.updatedAt))) : '—',
          })}
        </p>
      )}
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void restore();
        }}
      >
        <TextField
          label={t('auth.device.restorePassword')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          ltr
        />
        <Button icon="undo" type="submit" size="large" block disabled={working || password.length < MIN_BACKUP_PASSWORD_LENGTH}>
          {working ? t('auth.device.restoring') : t('auth.device.restore')}
        </Button>
        <Button variant="plain" block disabled={working} onClick={onSkip} data-testid="skip-restore">
          {t('auth.device.skip')}
        </Button>
      </form>
    </main>
  );
}
