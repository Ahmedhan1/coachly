import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { effectiveStatus, type Account, type AuthState } from '@/domain/account';
import { t, tParts } from '@/i18n';
import { Button, Icon } from '@/ui';
import { LanguageToggle } from './LanguageToggle';
import { PasteInviteButton } from '@/features/team/PasteInviteButton';
import styles from './AuthScreen.module.css';

export interface AccountGateScreenProps {
  account: Account;
  /** Called when the server's answer changed the state (approved, or the session ended). */
  onChange: (state: AuthState) => void;
}

type Note = 'checking' | 'stillPending' | 'offline' | null;

/** Signed in, but the owner has not approved the account yet (or turned it off). Data on the phone is untouched. */
export function AccountGateScreen({ account, onChange }: AccountGateScreenProps) {
  const { auth } = useServices();
  const [note, setNote] = useState<Note>(null);

  const check = async () => {
    setNote('checking');
    const next = await auth.refresh();
    if (next !== null) return onChange(next);
    setNote(navigator.onLine === false ? 'offline' : 'stillPending');
  };

  // Quiet check on arrival and whenever the trainer comes back to the app.
  useEffect(() => {
    const quiet = () => void auth.refresh().then((next) => next !== null && onChange(next));
    quiet();
    const onVisible = () => document.visibilityState === 'visible' && quiet();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth, onChange]);

  const status = effectiveStatus(account, new Date());
  const pending = status === 'pending';
  const gymPending = pending && account.gym?.membership === 'pending' ? account.gym.name : null;
  const title =
    status === 'expired'
      ? t('team.expired.title')
      : gymPending !== null
        ? t('team.membership.pendingTitle', { gym: gymPending })
        : pending
          ? t('auth.gate.pendingTitle')
          : t('auth.gate.disabledTitle');
  const lead =
    status === 'expired'
      ? t('team.expired.lead')
      : gymPending !== null
        ? t('team.membership.pendingLead')
        : pending
          ? t('auth.gate.pendingLead')
          : t('auth.gate.disabledLead');
  return (
    <main className={styles.page}>
      <div className={styles.langRow}>
        <LanguageToggle />
      </div>
      <span className={pending ? styles.gateIcon : styles.gateIconOff} aria-hidden="true">
        <Icon name={pending ? 'clock' : 'lock'} />
      </span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{lead}</p>
      <p className={styles.who}>
        {tParts('auth.gate.signedInAs', { email: <span dir="ltr">{account.email}</span> })}
      </p>
      <div className={styles.form}>
        <Button icon="refresh" size="large" block disabled={note === 'checking'} onClick={() => void check()}>
          {note === 'checking' ? t('auth.gate.checking') : t('auth.gate.check')}
        </Button>
        {(note === 'stillPending' || note === 'offline') && (
          <p className={styles.note} role="status">
            {t(`auth.gate.${note}`)}
          </p>
        )}
        {pending && account.gym === null && (
          <PasteInviteButton
            onJoined={async () => {
              const next = await auth.getState();
              onChange(next);
            }}
          />
        )}
        <Button
          variant="plain"
          icon="logout"
          block
          onClick={async () => {
            await auth.signOut();
            onChange({ status: 'signedOut' });
          }}
        >
          {t('auth.gate.signOut')}
        </Button>
      </div>
    </main>
  );
}
