import { useState } from 'react';
import { useServices } from '@/app/services';
import { checkForAppUpdate } from '@/app/pwa/appUpdate';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { CLIENT_PAGES_ENABLED_KEY, clientPagesEnabled } from '@/features/online/prefs';
import { t } from '@/i18n';
import { Badge, Icon, ListRow, ListSection, PageHeader } from '@/ui';
import { LanguageSwitch } from './LanguageSwitch';
import { teamErrorText } from '@/features/team/teamErrors';
import { PasteInviteButton } from '@/features/team/PasteInviteButton';
import { toIsoDate } from '@/domain/models';
import { formatIsoDate } from '@/ui/format';
import { SignOutSheet } from './SignOutSheet';
import styles from './SettingsScreen.module.css';

/** Who is signed in on this device (stored on the device; no network). */
function AccountRow() {
  const services = useServices();
  const { auth } = services;
  const showToast = useUiStore((st) => st.showToast);
  const state = useLive(() => auth.getState(), [auth]);
  const clients = useLive(() => services.data.repos.clients.list(), [services]);
  if (state?.status === 'guest') return <ListRow leading={<Icon name="user" />} title={t('auth.guest')} subtitle={t('settings.account.guest')} />;
  if (state?.status !== 'signedIn') return null;
  const { account } = state;
  const { plan, gym } = account;
  const facts = [
    plan.maxClients === null ? null : t('team.limit.clientsShort', { count: clients?.length ?? 0, n: plan.maxClients }),
    plan.expiresAt === null ? null : t('team.plan.until', { date: formatIsoDate(toIsoDate(new Date(plan.expiresAt * 1000 - 1000))) }),
  ].filter((f): f is string => f !== null);
  const leave = async () => {
    if (!gym || !window.confirm(t('team.membership.leaveConfirm', { gym: gym.name }))) return;
    const r = await services.online?.team?.leave();
    if (!r?.ok) return showToast({ message: teamErrorText(r?.error ?? 'server') });
    showToast({ message: t('team.membership.left'), duration: 2500 });
    // The account may lose its access with the gym: start again from the account check.
    await auth.refresh();
    window.location.reload();
  };
  return (
    <>
      <ListRow
        leading={<Icon name="user" />}
        title={t('settings.account.signedInAs', { name: account.name || account.email })}
        subtitle={
          <>
            <span dir="ltr">{account.email}</span> · {t('settings.account.approved')}
            {facts.length > 0 && <> · {facts.join(' · ')}</>}
          </>
        }
      />
      {gym !== null && gym.membership !== 'owner' && (
        <ListRow leading={<Icon name="users" />} title={t('team.membership.trainerOf', { gym: gym.name })} subtitle={t('team.membership.leaveHint')} trailing={<span className={styles.leave}>{t('team.membership.leave')}</span>} onClick={() => void leave()} />
      )}
      {gym === null && account.role !== 'gym' && (
        <div className={styles.language}>
          <PasteInviteButton onJoined={() => window.location.reload()} />
        </div>
      )}
      {gym !== null && gym.membership === 'owner' && <ListRow to="/more/team" leading={<Icon name="users" />} title={t('team.title')} subtitle={gym.name} />}
    </>
  );
}

export function SettingsScreen() {
  const { meta } = useServices();
  const showToast = useUiStore((st) => st.showToast);
  const [version, setVersion] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const pagesOn = useLive(() => clientPagesEnabled(meta), [meta, version]);

  return (
    <>
      <PageHeader title={t('screens.settings.title')} back={{ to: '/more', label: t('screens.more.title') }} />
      <ListSection label={t('screens.settings.identity')} className={styles.first}>
        <ListRow to="/more/settings/identity" leading={<Icon name="palette" />} title={t('screens.settings.identity')} subtitle={t('screens.settings.identityHint')} />
        <ListRow to="/more/settings/formulas" leading={<Icon name="target" />} title={t('settings.formulas.title')} subtitle={t('settings.formulas.hint')} />
        <ListRow to="/more/whatsapp-templates" leading={<Icon name="chat" />} title={t('schedule.more.whatsapp')} subtitle={t('schedule.more.whatsappHint')} />
      </ListSection>
      <ListSection bare>
        <div className={styles.language}>
          <LanguageSwitch />
        </div>
      </ListSection>
      <ListSection icon="backup" title={t('settings.page.backupTitle')}>
        <ListRow to="/more/settings/backup" leading={<Icon name="database" />} title={t('settings.backup.title')} subtitle={t('settings.backup.hint')} />
        <ListRow to="/more/settings/storage" leading={<Icon name="database" />} title={t('storage.screen.title')} subtitle={t('storage.screen.hint')} />
      </ListSection>
      <ListSection icon="cloud" title={t('settings.page.online')}>
        <ListRow to="/more/settings/notifications" leading={<Icon name="clock" />} title={t('settings.notifications.title')} subtitle={t('settings.notifications.hint')} />
        <ListRow
          leading={<Icon name="share" />}
          title={t('settings.clientPage.settingTitle')}
          subtitle={t('settings.clientPage.settingHint')}
          trailing={pagesOn !== undefined && <Badge tone={pagesOn ? 'ok' : 'neutral'}>{pagesOn ? t('settings.clientPage.settingOn') : t('settings.clientPage.settingOff')}</Badge>}
          onClick={async () => {
            await meta.set(CLIENT_PAGES_ENABLED_KEY, !pagesOn);
            setVersion((v) => v + 1);
          }}
        />
        <ListRow to="/more/settings/integrations" leading={<Icon name="key" />} title={t('settings.integrations.title')} subtitle={t('settings.integrations.hint')} />
      </ListSection>
      <ListSection icon="user" title={t('screens.settings.account')}>
        <AccountRow />
        <ListRow
          leading={<Icon name="cloudOk" />}
          title={t('settings.account.checkUpdate')}
          subtitle={t('settings.account.checkUpdateHint')}
          onClick={async () => {
            showToast({ message: t('settings.account.checking'), duration: 2000 });
            await checkForAppUpdate();
          }}
        />
        <ListRow leading={<Icon name="logout" />} title={t('settings.account.signOut')} subtitle={t('settings.account.signOutHint')} onClick={() => setSigningOut(true)} />
      </ListSection>
      {signingOut && <SignOutSheet onClose={() => setSigningOut(false)} />}
      <ListSection>
        <ListRow to="/more/settings/about" leading={<Icon name="note" />} title={t('settings.page.about')} subtitle={t('settings.page.aboutHint')} />
      </ListSection>
    </>
  );
}
