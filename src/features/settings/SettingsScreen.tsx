import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { DeviceIdCard } from '@/features/activation/DeviceIdCard';
import { CLIENT_PAGES_ENABLED_KEY, clientPagesEnabled } from '@/features/online/prefs';
import { t } from '@/i18n';
import { Badge, Icon, ListRow, ListSection, PageHeader } from '@/ui';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { activation, meta } = useServices();
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
      <ListSection title={t('settings.page.backupTitle')}>
        <ListRow to="/more/settings/backup" leading={<Icon name="database" />} title={t('settings.backup.title')} subtitle={t('settings.backup.hint')} />
      </ListSection>
      <ListSection title={t('settings.page.online')}>
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
      <ListSection title={t('screens.settings.license')} bare>
        <DeviceIdCard deviceId={deviceId} />
      </ListSection>
      <ListSection>
        <ListRow to="/more/settings/about" leading={<Icon name="note" />} title={t('settings.page.about')} subtitle={t('settings.page.aboutHint')} />
      </ListSection>
    </>
  );
}
