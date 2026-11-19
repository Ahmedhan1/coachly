import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { checkForAppUpdate } from '@/app/pwa/appUpdate';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { toIsoDate } from '@/domain/models';
import { DeviceIdCard } from '@/features/activation/DeviceIdCard';
import { CLIENT_PAGES_ENABLED_KEY, clientPagesEnabled } from '@/features/online/prefs';
import { t } from '@/i18n';
import { Badge, Icon, ListRow, ListSection, PageHeader } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './SettingsScreen.module.css';

/** Who the license belongs to and until when (from the signed token on this device; no network). */
function LicenseRow() {
  const { activation } = useServices();
  const state = useLive(() => activation.getState(), [activation]);
  if (!state || state.status !== 'active') return null;
  const until = state.expiresAt;
  return (
    <ListRow
      leading={<Icon name="key" />}
      title={
        until === null
          ? t('settings.license.activeLifetime', { name: state.trainerName })
          : t('settings.license.activeUntil', { name: state.trainerName, date: formatIsoDate(toIsoDate(new Date(until))) })
      }
      subtitle={until === null ? t('settings.license.lifetime') : t('settings.license.until')}
    />
  );
}

export function SettingsScreen() {
  const { activation, meta } = useServices();
  const showToast = useUiStore((st) => st.showToast);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const pagesOn = useLive(() => clientPagesEnabled(meta), [meta, version]);
  useEffect(() => {
    let cancelled = false;
    void activation.getDeviceId().then((id) => !cancelled && setDeviceId(id));
    return () => {
      cancelled = true;
    };
  }, [activation]);

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
      <ListSection icon="key" title={t('screens.settings.license')}>
        <LicenseRow />
        <ListRow
          leading={<Icon name="cloudOk" />}
          title={t('settings.license.checkUpdate')}
          subtitle={t('settings.license.checkUpdateHint')}
          onClick={async () => {
            showToast({ message: t('settings.license.checking'), duration: 2000 });
            await checkForAppUpdate();
          }}
        />
      </ListSection>
      <ListSection bare>
        <DeviceIdCard deviceId={deviceId} />
      </ListSection>
      <ListSection>
        <ListRow to="/more/settings/about" leading={<Icon name="note" />} title={t('settings.page.about')} subtitle={t('settings.page.aboutHint')} />
      </ListSection>
    </>
  );
}
