import { useId, useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { Client } from '@/domain/models';
import { useStoredImageUrl } from '@/app/useStoredImageUrl';
import { t } from '@/i18n';
import { Icon } from '@/ui';
import { setClientPhoto } from './clientPhoto';
import styles from './ClientDetail.module.css';

/**
 * The client's photo in the client file. Tapping it opens the iPhone's own picker (photo library, camera or
 * files); the photo is downscaled, kept on the phone and copied, encrypted, to the cloud.
 */
export function ClientPhotoPicker({ client }: { client: Client }) {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const inputId = useId();
  const url = useStoredImageUrl(client.photoId);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await setClientPhoto(services, client, file);
      showToast({ message: t('files.clientPhoto.saved', { name: client.name }), duration: 2500 });
    } catch {
      showToast({ message: t('files.clientPhoto.failed'), duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? t('files.clientPhoto.processing') : client.photoId ? t('files.clientPhoto.change') : t('files.clientPhoto.add');
  return (
    <label htmlFor={inputId} className={styles.photo} aria-label={label} title={label} aria-busy={busy}>
      {url ? <img src={url} alt={t('files.clientPhoto.alt', { name: client.name })} className={styles.photoImg} draggable={false} /> : <Icon name="user" />}
      <span className={styles.photoBadge} aria-hidden="true">
        <Icon name="camera" />
      </span>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="visually-hidden"
        disabled={busy}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
