import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { toIsoDate } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, PageHeader, Select } from '@/ui';
import { formatIsoDate, formatTime } from '@/ui/format';
import { readPushPrefs, savePushPrefs, type PushPrefs } from '@/features/online/prefs';
import { enablePushNotifications } from '@/features/online/enablePush';
import { syncPush } from '@/features/online/sync';
import styles from './Settings.module.css';

const LEADS = [15, 30, 60, 120];
const RENEWALS = [1, 2, 3, 7];

/** الإعدادات ← الإشعارات: Web Push before sessions and before a subscription ends. */
export function NotificationsScreen() {
  const services = useServices();
  const { meta } = services;
  const push = services.online?.push;
  const showToast = useUiStore((s) => s.showToast);
  const [version, setVersion] = useState(0);
  const prefs = useLive(() => readPushPrefs(meta), [meta, version]);
  const [busy, setBusy] = useState(false);
  const back = { to: '/more/settings', label: t('screens.settings.title') };
  if (!prefs) return <PageHeader title={t('settings.notifications.title')} back={back} />;

  const supported = push?.supported() ?? false;
  const permission = push?.permission() ?? 'unsupported';
  const update = async (next: PushPrefs) => {
    await savePushPrefs(meta, next);
    setVersion((v) => v + 1);
    // A new lead time or renewal day changes every reminder: resend the schedule (quietly) when push is on.
    if (next.enabled) void syncPush(services).then(() => setVersion((v) => v + 1));
  };
  const sync = async () => {
    setBusy(true);
    const n = await syncPush(services);
    setBusy(false);
    setVersion((v) => v + 1);
    showToast({ message: n === null ? t('settings.notifications.failed') : t('settings.notifications.syncedOk', { n }), duration: 2500 });
  };

  const enable = async () => {
    if (!push) return;
    setBusy(true);
    const r = await enablePushNotifications(services);
    setBusy(false);
    setVersion((v) => v + 1);
    if (!r.ok) {
      const key =
        r.error === 'denied'
          ? 'settings.notifications.denied'
          : r.error === 'unsupported'
            ? 'settings.notifications.unsupported'
            : r.error === 'not_configured'
              ? 'settings.notifications.notConfigured'
              : 'settings.notifications.failed';
      return showToast({ message: t(key) });
    }
    showToast({ message: r.scheduled === null ? t('settings.notifications.failed') : t('settings.notifications.syncedOk', { n: r.scheduled }), duration: 2500 });
  };

  return (
    <>
      <PageHeader title={t('settings.notifications.title')} back={back} subtitle={t('settings.notifications.lead')} />
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('settings.notifications.title')}</h2>
          <Badge tone={prefs.enabled ? 'ok' : 'neutral'}>{prefs.enabled ? t('settings.notifications.on') : t('settings.notifications.off')}</Badge>
        </div>
        <p className={styles.body}>{t('settings.notifications.privacy')}</p>
        {!supported && <p className={styles.warnBox}>{t('settings.notifications.unsupported')}</p>}
        {supported && permission === 'denied' && <p className={styles.warnBox}>{t('settings.notifications.denied')}</p>}
        <Select
          label={t('settings.notifications.leadLabel')}
          value={String(prefs.leadMinutes)}
          onChange={(v) => void update({ ...prefs, leadMinutes: Number(v) })}
          options={LEADS.map((n) => ({ value: String(n), label: t('settings.notifications.leadOption', { n }) }))}
        />
        <Select
          label={t('settings.notifications.renewalLabel')}
          value={String(prefs.renewalDays)}
          onChange={(v) => void update({ ...prefs, renewalDays: Number(v) })}
          options={RENEWALS.map((n) => ({ value: String(n), label: t('settings.notifications.renewalOption', { n }) }))}
        />
        {prefs.enabled ? (
          <>
            {prefs.lastSyncAt && (
              <p className={styles.meta}>{t('settings.notifications.synced', { date: `${formatIsoDate(toIsoDate(new Date(prefs.lastSyncAt)))} ${formatTime(prefs.lastSyncAt)}` })}</p>
            )}
            <Button block icon="clock" disabled={busy} onClick={() => void sync()}>
              {t('settings.notifications.syncNow')}
            </Button>
            <Button
              block
              variant="plain"
              disabled={busy}
              onClick={async () => {
                await push?.disable();
                await update({ ...prefs, enabled: false });
              }}
            >
              {t('settings.notifications.disable')}
            </Button>
          </>
        ) : (
          <Button block icon="clock" disabled={busy || !supported} onClick={() => void enable()}>
            {t('settings.notifications.enable')}
          </Button>
        )}
        <p className={styles.meta}>{t('settings.notifications.calendarFallback')}</p>
      </section>
    </>
  );
}
