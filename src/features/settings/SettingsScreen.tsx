import { useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { DeviceIdCard } from '@/features/activation/DeviceIdCard';
import { t } from '@/i18n';
import { Icon, ListRow, ListSection, PageHeader } from '@/ui';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { activation } = useServices();
  const [deviceId, setDeviceId] = useState<string | null>(null);
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
        <ListRow
          to="/more/settings/identity"
          leading={<Icon name="palette" />}
          title={t('screens.settings.identity')}
          subtitle={t('screens.settings.identityHint')}
        />
      </ListSection>
      <ListSection title={t('screens.settings.license')} bare footer={t('screens.settings.more')}>
        <DeviceIdCard deviceId={deviceId} />
      </ListSection>
    </>
  );
}
