import { useState } from 'react';
import { useServices } from '@/app/services';
import { t } from '@/i18n';
import { Button, FileButton } from '@/ui';
import { useStoredImageUrl } from '@/app/useStoredImageUrl';
import styles from './Files.module.css';

const RECEIPT_MAX_SIDE = 1600;

/**
 * Optional photo of a payment receipt (InstaPay / wallet screenshot). The picture is stored on the phone at
 * once; the caller saves its id with the payment and queues the encrypted cloud copy.
 */
export function ReceiptField({ value, onChange }: { value: string | null; onChange: (imageId: string | null) => void }) {
  const { images, data } = useServices();
  const url = useStoredImageUrl(value);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState('busy');
    try {
      // Screenshots are tall and full of small text: keep more pixels than a photo.
      const saved = await data.repos.images.save(await images.downscale(file, RECEIPT_MAX_SIDE));
      onChange(saved.id);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={styles.receipt}>
      <span className={styles.receiptLabel}>{t('files.invoice.label')}</span>
      <div className={styles.receiptRow}>
        {url && <img src={url} alt={t('files.invoice.alt')} className={styles.receiptThumb} />}
        <FileButton icon="camera" accept="image/*" onFiles={([file]) => void pick(file)}>
          {state === 'busy' ? t('files.clientPhoto.processing') : value ? t('files.invoice.change') : t('files.invoice.attach')}
        </FileButton>
        {value && (
          <Button icon="trash" variant="danger" size="small" onClick={() => onChange(null)}>
            {t('files.invoice.remove')}
          </Button>
        )}
      </div>
      <p className={styles.hint}>{state === 'error' ? t('files.clientPhoto.failed') : t('files.invoice.hint')}</p>
    </div>
  );
}
