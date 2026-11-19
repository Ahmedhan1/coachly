import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { t } from '@/i18n';
import { Button, PageHeader, Select, TextField } from '@/ui';
import { postWebhook } from '@/services/integrations/webhook';
import { readWebhook, saveWebhook, type WebhookSettings } from '@/features/online/integrations';
import { AiSettingsCard } from './AiSettingsCard';
import styles from './Settings.module.css';

/** الإعدادات ← الـ AI والتكاملات: both off by default. */
export function IntegrationsScreen() {
  const { meta } = useServices();
  const hook = useLive(() => readWebhook(meta), [meta]);
  const back = { to: '/more/settings', label: t('screens.settings.title') };
  if (!hook) return <PageHeader title={t('settings.integrations.title')} back={back} />;
  return (
    <>
      <PageHeader title={t('settings.integrations.title')} back={back} />
      <AiSettingsCard />
      <WebhookCard initial={hook} />
    </>
  );
}

function WebhookCard({ initial }: { initial: WebhookSettings }) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [w, setW] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const valid = (url: string) => url === '' || /^https:\/\/\S+$/.test(url);
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('settings.integrations.webhookTitle')}</h2>
      <p className={styles.body}>{t('settings.integrations.webhookBody')}</p>
      <TextField
        label={t('settings.integrations.webhookUrl')}
        hint={t('settings.integrations.webhookPrivacy')}
        inputMode="url"
        value={w.url}
        error={error}
        onChange={(e) => {
          setW({ ...w, url: e.target.value.trim() });
          setError(null);
        }}
        ltr
      />
      {(['enabled', 'clientCreated', 'subscriptionEnding'] as const).map((k) => (
        <label key={k} className={styles.check}>
          <input type="checkbox" checked={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.checked })} />
          <span>{t(k === 'enabled' ? 'settings.integrations.webhookEnabled' : `settings.integrations.${k}`)}</span>
        </label>
      ))}
      <Select
        label={t('settings.integrations.endingDays')}
        value={String(w.endingDays)}
        onChange={(v) => setW({ ...w, endingDays: Number(v) })}
        options={[1, 2, 3, 5, 7].map((n) => ({ value: String(n), label: String(n) }))}
      />
      <Button icon="check"
        block
        onClick={async () => {
          if (!valid(w.url)) return setError(t('settings.integrations.invalidUrl'));
          await saveWebhook(meta, { ...w, enabled: w.enabled && w.url !== '' });
          showToast({ message: t('settings.integrations.saved'), duration: 2500 });
        }}
      >
        {t('settings.integrations.save')}
      </Button>
      <Button icon="send"
        block
        variant="secondary"
        disabled={!w.url}
        onClick={async () => {
          if (!valid(w.url)) return setError(t('settings.integrations.invalidUrl'));
          const ok = await postWebhook(w.url, { event: 'test', at: new Date().toISOString() });
          showToast({ message: ok ? t('settings.integrations.testOk') : t('settings.integrations.testFailed') });
        }}
      >
        {t('settings.integrations.test')}
      </Button>
    </section>
  );
}
