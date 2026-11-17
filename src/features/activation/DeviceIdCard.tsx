import { useState } from 'react';
import { t } from '@/i18n';
import { IconButton } from '@/ui';
import styles from './ActivationScreen.module.css';

/** execCommand fallback for browsers or web views without the async clipboard API (older Android, in-app views). */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  return legacyCopy(text);
}

/** Last resort: select the id on screen so a long-press offers «نسخ». */
function selectText(id: string): void {
  const el = document.querySelector(`[data-testid="${id}"]`);
  const selection = window.getSelection();
  if (el && selection) selection.selectAllChildren(el);
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
            if (!deviceId) return;
            if (await copyText(deviceId)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            } else {
              selectText('device-id');
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
