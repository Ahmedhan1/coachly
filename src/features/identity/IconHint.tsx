import { useCallback, useState } from 'react';
import { useServices } from '@/app/services';
import { t } from '@/i18n';
import { Sheet } from '@/ui';
import { ICON_HINT_KEY, refreshBrandAssets } from './brandAssets';
import styles from './Identity.module.css';

/**
 * After the identity is saved: rebuilds the launch splash / icon cache, and the first time a logo is set
 * explains that the home-screen icon only changes after re-adding the app. `afterSave` resolves to true when
 * the hint is now open (call `onDone` from its close instead of navigating right away).
 */
export function useIconHint(onDone: () => void) {
  const { data, meta } = useServices();
  const [open, setOpen] = useState(false);
  const afterSave = useCallback(async (): Promise<boolean> => {
    const logoChanged = await refreshBrandAssets({ data }).catch(() => false);
    if (!logoChanged || (await meta.get(ICON_HINT_KEY))) return false;
    await meta.set(ICON_HINT_KEY, Date.now());
    setOpen(true);
    return true;
  }, [data, meta]);
  const sheet = open ? (
    <Sheet
      open
      title={t('identity.logo.iconHintTitle')}
      cancelLabel={t('common.close')}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
    >
      <p className={styles.lead}>{t('identity.logo.iconHint')}</p>
    </Sheet>
  ) : null;
  return { afterSave, sheet };
}
