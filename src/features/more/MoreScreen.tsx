import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { t, type TKey } from '@/i18n';
import { Button, Icon, ListRow, ListSection, PageHeader, type IconName } from '@/ui';
import { formatBytes } from '@/ui/format';
import styles from './MoreScreen.module.css';

const SCREEN_ICONS = {
  programs: 'list',
  muscleMap: 'body',
  nutrition: 'utensils',
  supplements: 'pill',
  progress: 'chart',
  pdf: 'file',
  settings: 'settings',
} as const satisfies Record<string, IconName>;

const LINKS: ReadonlyArray<{ to: string; key: keyof typeof SCREEN_ICONS }> = [
  { to: '/more/programs', key: 'programs' },
  { to: '/more/muscle-map', key: 'muscleMap' },
  { to: '/more/nutrition', key: 'nutrition' },
  { to: '/more/supplements', key: 'supplements' },
  { to: '/more/progress', key: 'progress' },
  { to: '/more/pdf', key: 'pdf' },
  { to: '/more/settings', key: 'settings' },
];

export function MoreScreen() {
  const { storage, data, auth } = useServices();
  const authState = useLive(() => auth.getState(), [auth]);
  const managesGym = authState?.status === 'signedIn' && authState.account.role === 'gym';
  const showToast = useUiStore((s) => s.showToast);
  const estimate = useLive(() => storage.estimate(), [storage]);
  const persisted = useLive(() => storage.isPersisted(), [storage]);
  const hasDemo = useLive(() => data.hasDemoData(), [data]);

  return (
    <>
      <PageHeader title={t('screens.more.title')} back={{ to: '/', label: t('tabs.home') }} />
      <div>
        <ListSection className={styles.first} label={t('screens.more.title')}>
          {managesGym && <ListRow to="/more/team" leading={<Icon name="users" />} title={t('team.title')} subtitle={t('team.hint')} />}
          {LINKS.map((link) => (
            <ListRow
              key={link.to}
              to={link.to}
              leading={<Icon name={SCREEN_ICONS[link.key]} />}
              title={t(`screens.${link.key}.title` as TKey)}
            />
          ))}
        </ListSection>
        <ListSection icon="money" title={t('schedule.income.title')}>
 <ListRow to="/more/assistant" leading={<Icon name="chat" />} title={t('assistant.title')} subtitle={t('assistant.hint')} />
 <ListRow to="/more/outbox" leading={<Icon name="chat" />} title={t('outbox.title')} subtitle={t('outbox.hint')} />
          <ListRow to="/more/income" leading={<Icon name="wallet" />} title={t('schedule.more.income')} subtitle={t('schedule.more.incomeHint')} />
          <ListRow to="/more/whatsapp-templates" leading={<Icon name="chat" />} title={t('schedule.more.whatsapp')} subtitle={t('schedule.more.whatsappHint')} />
          <ListRow to="/more/recipes" leading={<Icon name="utensils" />} title={t('nutrition.hub.recipesTitle')} subtitle={t('nutrition.hub.recipesHint')} />
        </ListSection>
        <ListSection icon="storage"
          title={t('screens.more.storage')}
          footer={persisted ? t('screens.more.persisted') : t('screens.more.notPersisted')}
        >
          <ListRow
            leading={<Icon name="database" />}
            title={
              estimate
                ? t('screens.more.storageValue', { used: formatBytes(estimate.usageBytes), quota: formatBytes(estimate.quotaBytes) })
                : t('screens.more.storageUnknown')
            }
          />
        </ListSection>
        {hasDemo && (
          <Button
            variant="danger"
            icon="trash"
            className={styles.demo}
            onClick={async () => {
              await data.removeDemoData();
              showToast({ message: t('home.demoRemoved') });
            }}
          >
            {t('home.demoRemove')}
          </Button>
        )}
      </div>
    </>
  );
}
