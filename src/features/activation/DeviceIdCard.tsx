import { useState } from 'react';
import { t } from '@/i18n';
import { IconButton } from '@/ui';
import styles from './ActivationScreen.module.css';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The install's device id, selectable and copyable, so the trainer can send it for an offline code. */
export function DeviceIdCard({ deviceId }: { deviceId: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className={styles.device} aria-labelledby="device-id-title">
      <div className={styles.deviceHead}>
        <h2 id="device-id-title" className={styles.deviceTitle}>
          {t('activation.deviceTitle')}
        </h2>
        <span className={styles.copied} role="status">
          {copied ? t('activation.copied') : ''}
        </span>
        <IconButton
          icon="copy"
          tone="muted"
          label={t('activation.copyDevice')}
          disabled={!deviceId}
          onClick={async () => {
            if (deviceId && (await copyText(deviceId))) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            }
          }}
        />
      </div>
      <output className={styles.deviceId} dir="ltr" data-testid="device-id">
        {deviceId ?? '…'}
      </output>
      <p className={styles.deviceHint}>{t('activation.deviceHint')}</p>
    </section>
  );
}
