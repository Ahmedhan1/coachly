import { useId, useState } from 'react';
import { useServices } from '@/app/services';
import { Icon } from '@/ui';
import { storePhoto } from './photos';
import { StoredImage } from './StoredImage';
import common from './common.module.css';
import styles from './PhotoField.module.css';

interface PhotoFieldProps {
  label: string;
  addLabel: string;
  removeLabel: string;
  imageId: string | null;
  onChange: (imageId: string | null) => void;
}

/** One optional photo: picks from camera/library, downscales to ≤1200 px, stores it locally. */
export function PhotoField({ label, addLabel, removeLabel, imageId, onChange }: PhotoFieldProps) {
  const services = useServices();
  const id = useId();
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.field}>
      <span className={common.caption}>{label}</span>
      <div className={styles.row}>
        {imageId && <StoredImage imageId={imageId} alt={label} className={styles.thumb} />}
        <label className={common.fileButton} htmlFor={id} aria-busy={busy}>
          <Icon name="image" />
          {addLabel}
          <input
            id={id}
            className={styles.input}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                const stored = await storePhoto(services, file);
                onChange(stored.imageId);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {imageId && (
          <button type="button" className={styles.remove} onClick={() => onChange(null)}>
            {removeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
