import { Outlet, useMatch } from 'react-router-dom';
import { AddClientSheet } from '@/features/clients/AddClientSheet';
import { QuickAddSheet } from '@/features/quickAdd/QuickAddSheet';
import { t } from '@/i18n';
import { cx, TabBar, ToastHost, type TabItem } from '@/ui';
import { useUiStore } from './uiStore';
import styles from './AppShell.module.css';

/** 4 tabs + center add (DESIGN.md §5). "More"/settings lives behind the trainer button on Home. */
const TABS: readonly TabItem[] = [
  { to: '/', label: t('tabs.home'), icon: 'home', end: true },
  { to: '/clients', label: t('tabs.clients'), icon: 'users', end: true },
  { to: '/schedule', label: t('tabs.schedule'), icon: 'calendar' },
  { to: '/exercises', label: t('tabs.exercises'), icon: 'dumbbell' },
];

export function AppShell() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  // Pushed screens hide the tab bar and show their own bottom action bar.
  const pushed = useMatch('/clients/:clientId') !== null;
  return (
    <div className={cx(styles.shell, pushed && styles.pushed)}>
      <main className={styles.main}>
        <Outlet />
      </main>
      {!pushed && <TabBar items={TABS} label={t('tabs.label')} center={{ label: t('tabs.add'), onClick: openQuickAdd }} />}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <QuickAddSheet />
      <AddClientSheet />
    </div>
  );
}

export function RouteFallback() {
  return <p className={styles.fallback}>{t('app.loading')}</p>;
}
