import { useState } from 'react';
import { useServices } from '@/app/services';
import { Button, FileButton } from '@/ui';
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
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.field}>
      <span className={common.caption}>{label}</span>
      <div className={styles.row}>
        {imageId && <StoredImage imageId={imageId} alt={label} className={styles.thumb} />}
        <FileButton
          icon="image"
          accept="image/*"
          busy={busy}
          onFiles={async ([file]) => {
            if (!file) return;
            setBusy(true);
            try {
              const stored = await storePhoto(services, file);
              onChange(stored.imageId);
            } finally {
              setBusy(false);
            }
          }}
        >
          {addLabel}
        </FileButton>
        {imageId && (
          <Button icon="trash" variant="danger" size="small" onClick={() => onChange(null)}>
            {removeLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
