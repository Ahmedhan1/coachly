import { Outlet } from 'react-router-dom';
import { AddClientSheet } from '@/features/clients/AddClientSheet';
import { t } from '@/i18n';
import { TabBar, ToastHost, type TabItem } from '@/ui';
import { useServices } from './services';
import { useUiStore } from './uiStore';
import { useBrandTheme } from './useBrandTheme';
import { useLive } from './useLive';
import styles from './AppShell.module.css';

const TABS: readonly TabItem[] = [
  { to: '/', label: t('tabs.home'), icon: 'home', end: true },
  { to: '/clients', label: t('tabs.clients'), icon: 'users' },
  { to: '/schedule', label: t('tabs.schedule'), icon: 'calendar' },
  { to: '/exercises', label: t('tabs.exercises'), icon: 'dumbbell' },
  { to: '/more', label: t('tabs.more'), icon: 'more' },
];

export function AppShell() {
  const { data } = useServices();
  const settings = useLive(() => data.repos.settings.get(), [data]);
  useBrandTheme(settings);
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <TabBar items={TABS} label={t('tabs.label')} />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <AddClientSheet />
    </div>
  );
}

export function RouteFallback() {
  return <p className={styles.fallback}>{t('app.loading')}</p>;
}
