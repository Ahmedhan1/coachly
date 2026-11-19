import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { t } from '@/i18n';
import { HttpBrandHosting } from '@/services/brand/brandHosting';
import { Button, Sheet } from '@/ui';
import { refreshBrandAssets } from './brandAssets';
import { hostCurrentBrand } from './hostedBrand';
import styles from './Identity.module.css';

type LinkState = { kind: 'making' } | { kind: 'ready'; link: string } | { kind: 'failed' };

/**
 * An installed iPhone app never changes its home-screen icon, so a new logo reaches the icon only by adding
 * the app again. This uploads the current icon set and gives a ready install link with the steps to move.
 */
export function IconLinkPanel() {
  const { data } = useServices();
  const hosting = useMemo(() => new HttpBrandHosting(), []);
  const [state, setState] = useState<LinkState>({ kind: 'making' });
  const [copied, setCopied] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void hostCurrentBrand({ data }, hosting)
      .catch(() => null)
      .then((id) => {
        if (!cancelled) setState(id ? { kind: 'ready', link: `${window.location.origin}/?brand=${id}` } : { kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [data, hosting, attempt]);

  const make = () => {
    setState({ kind: 'making' });
    setAttempt((n) => n + 1);
  };

  return (
    <div className={styles.iconLink} data-testid="icon-link">
      <p className={styles.lead}>{t('identity.logo.iconLinkLead')}</p>
      <ol className={styles.iconSteps}>
        <li>{t('identity.logo.iconStep1')}</li>
        <li>{t('identity.logo.iconStep2')}</li>
        <li>{t('identity.logo.iconStep3')}</li>
        <li>{t('identity.logo.iconStep4')}</li>
      </ol>
      {state.kind === 'making' && <p role="status">{t('identity.logo.iconLinkMaking')}</p>}
      {state.kind === 'failed' && (
        <>
          <p className={styles.error} role="alert">
            {t('identity.logo.iconLinkFailed')}
          </p>
          <Button icon="refresh" variant="secondary" onClick={make}>
            {t('identity.logo.iconLinkRetry')}
          </Button>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <p className={styles.iconLinkUrl} dir="ltr">
            {state.link}
          </p>
          <Button icon="copy"
            block
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? t('identity.logo.iconLinkCopied') : t('identity.logo.iconLinkCopy')}
          </Button>
        </>
      )}
    </div>
  );
}

/** Sheet with the icon link (used after saving a new logo, and from the identity screen's icon button). */
export function IconLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Sheet open title={t('identity.logo.iconLinkTitle')} cancelLabel={t('common.close')} onClose={onClose}>
      <p className={styles.lead}>{t('identity.logo.iconHint')}</p>
      <IconLinkPanel />
    </Sheet>
  );
}

/**
 * After the identity is saved: rebuilds the launch splash / icon cache, and when the logo changed offers the
 * icon link. `afterSave` resolves to true when the sheet is now open (call `onDone` from its close instead of
 * navigating right away).
 */
export function useIconHint(onDone: () => void) {
  const { data } = useServices();
  const [open, setOpen] = useState(false);
  const afterSave = useCallback(async (): Promise<boolean> => {
    const logoChanged = await refreshBrandAssets({ data }).catch(() => false);
    if (!logoChanged) return false;
    setOpen(true);
    return true;
  }, [data]);
  const sheet = (
    <IconLinkSheet
      open={open}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
    />
  );
  return { afterSave, sheet };
}
