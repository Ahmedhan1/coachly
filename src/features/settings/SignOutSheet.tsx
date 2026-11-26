import { useState } from 'react';
import { useServices } from '@/app/services';
import { t } from '@/i18n';
import { Sheet } from '@/ui';
import styles from './Settings.module.css';

/** Confirms signing out. The trainer's data stays on the device; the app restarts on the sign-in screen. */
export function SignOutSheet({ onClose, reload = () => window.location.reload() }: { onClose: () => void; reload?: () => void }) {
  const { auth } = useServices();
  const [working, setWorking] = useState(false);
  const signOut = async () => {
    setWorking(true);
    await auth.signOut();
    reload();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('settings.account.signOutTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} disabled={working} onClick={() => void signOut()} data-testid="confirm-sign-out">
          {t('settings.account.signOutConfirm')}
        </button>
      }
    >
      <div className={styles.form}>
        <p className={styles.body}>{t('settings.account.signOutBody')}</p>
      </div>
    </Sheet>
  );
}
