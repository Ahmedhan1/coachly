import { t } from '@/i18n';
import { PageHeader } from '@/ui';
import { ClientChooser } from '../shared/ClientChooser';

/** More → التقدم: pick a client, then their progress screen. */
export function ProgressHubScreen() {
  return (
    <>
      <PageHeader title={t('nutrition.progress.title')} back={{ to: '/more', label: t('nutrition.progress.back') }} />
      <ClientChooser path="progress" title={t('nutrition.progress.pickClient')} emptyBody={t('nutrition.progress.noClients')} />
    </>
  );
}
