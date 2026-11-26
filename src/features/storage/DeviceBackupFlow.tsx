import { useState } from 'react';
import { t } from '@/i18n';
import { MIN_BACKUP_PASSWORD_LENGTH, type DeviceFileSaver } from '@/services/backup';
import { Button, Sheet, TextField } from '@/ui';
import { formatBytes } from '@/ui/format';
import { useDeviceBackup, type SetupChoice } from './useDeviceBackup';
import styles from './Storage.module.css';

interface Props {
  onSaved?: () => void;
  saver?: DeviceFileSaver;
  /** Show "change password" under the button (Settings). */
  showSettings?: boolean;
}

/** The «نزّل نسخة على التليفون» button with its progress, send and "did it land?" steps. */
export function DeviceBackupFlow({ onSaved, saver, showSettings }: Props) {
  const flow = useDeviceBackup({ onSaved, saver });
  if (!flow.available) return null;
  const { state } = flow;
  return (
    <div className={styles.flow}>
      {state.kind === 'ready' ? (
        <>
          <Button block icon="share" onClick={() => void flow.send(state.file)}>
            {t('storage.device.sendToSelf')} · {formatBytes(state.file.blob.size)}
          </Button>
          <p className={styles.meta}>{t('storage.device.sendToSelfHint')}</p>
        </>
      ) : state.kind === 'confirm' ? (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="dl-confirm">
          <p id="dl-confirm" className={styles.strong}>
            {t('storage.device.confirmTitle')}
          </p>
          <p className={styles.body}>{t('storage.device.confirmBody')}</p>
          <Button block icon="check" onClick={() => void flow.confirm(true)}>
            {t('storage.device.confirmYes')}
          </Button>
          <Button block variant="secondary" onClick={() => void flow.confirm(false)}>
            {t('storage.device.confirmNo')}
          </Button>
        </div>
      ) : (
        <Button block icon="file" disabled={state.kind === 'working'} onClick={() => void flow.start()} aria-live="polite">
          {state.kind === 'working' ? state.label : t('storage.device.button')}
        </Button>
      )}
      {showSettings && state.kind === 'idle' && (
        <Button icon="settings" block variant="plain" onClick={flow.openSetup}>
          {t('storage.device.changeSettings')}
        </Button>
      )}
      {state.kind === 'setup' && <SetupSheet onClose={flow.cancelSetup} onSubmit={(c) => void flow.submitSetup(c)} />}
    </div>
  );
}

function SetupSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (c: SetupChoice) => void }) {
  const [encrypt, setEncrypt] = useState(true);
  const [remember, setRemember] = useState(true);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!encrypt) return onSubmit({ encrypt: false, password: null, remember: false });
    if (a.length < MIN_BACKUP_PASSWORD_LENGTH) return setError(t('settings.backup.passwordWeak'));
    if (a !== b) return setError(t('settings.backup.passwordMismatch'));
    onSubmit({ encrypt: true, password: a, remember });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('storage.device.setupTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" onClick={submit}>
          {t('storage.device.start')}
        </Button>
      }
    >
      <div className={styles.form}>
        <p className={styles.body}>{t('storage.device.setupBody')}</p>
        <label className={styles.check}>
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>
            {t('storage.device.encrypt')}
            <small>{t('storage.device.encryptHint')}</small>
          </span>
        </label>
        {encrypt && (
          <>
            <TextField label={t('settings.backup.password')} type="password" autoComplete="new-password" value={a} error={error} onChange={(e) => (setA(e.target.value), setError(null))} ltr />
            <TextField label={t('settings.backup.passwordConfirm')} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} ltr />
            <label className={styles.check}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                {t('storage.device.remember')}
                <small>{t('storage.device.rememberHint')}</small>
              </span>
            </label>
          </>
        )}
      </div>
    </Sheet>
  );
}
