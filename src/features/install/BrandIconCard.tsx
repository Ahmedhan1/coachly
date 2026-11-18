import { useEffect, useId, useMemo, useState } from 'react';
import { BRAND_PRESETS, DEFAULT_BRAND } from '@/domain/branding';
import { applyHostedBrand, hostLogo } from '@/features/identity/hostedBrand';
import { t, type TKey } from '@/i18n';
import { HttpBrandHosting, type BrandHosting } from '@/services/brand/brandHosting';
import { Icon } from '@/ui';
import { brandParam, brandPath } from '../../../shared/brandIcon';
import styles from './BrandIconCard.module.css';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ready'; preview: string } | { kind: 'failed' } | { kind: 'badImage' };

async function opens(file: Blob): Promise<boolean> {
  try {
    const b = await createImageBitmap(file);
    b.close();
    return true;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return true;
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Install page (before "Add to Home Screen"): the trainer picks the logo and a background colour, the phone
 * builds the icon set, and this page's icon / manifest / launch-image links point at the hosted copy, so the
 * iPhone takes the logo when the app is added. A `?brand=<id>` link (made inside the app) arrives ready.
 */
export function BrandIconCard({ hosting: given }: { hosting?: BrandHosting }) {
  const hosting = useMemo(() => given ?? new HttpBrandHosting(), [given]);
  const inputId = useId();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [color, setColor] = useState<string>(DEFAULT_BRAND);
  const [logo, setLogo] = useState<Blob | null>(null);

  // Opened from an in-app "new icon" link: the brand already exists.
  useEffect(() => {
    const id = brandParam(window.location.search);
    if (!id) return;
    let cancelled = false;
    void hosting.info(id).then((info) => {
      if (cancelled || !info) return;
      applyHostedBrand(id, info.startup);
      setColor(info.color);
      setState({ kind: 'ready', preview: brandPath(id, 'icon-180.png') });
    });
    return () => {
      cancelled = true;
    };
  }, [hosting]);

  const run = async (file: Blob, hex: string) => {
    setState({ kind: 'busy' });
    if (!(await opens(file))) return setState({ kind: 'badImage' });
    const hosted = await hostLogo(hosting, hex, file).catch(() => null);
    if (!hosted) return setState({ kind: 'failed' });
    applyHostedBrand(hosted.id, hosted.startup);
    setState({ kind: 'ready', preview: hosted.preview });
  };

  const busy = state.kind === 'busy';
  return (
    <section className={styles.card} aria-labelledby={`${inputId}-title`} data-testid="brand-icon-card">
      <div className={styles.top}>
        <div className={styles.preview}>
          {state.kind === 'ready' ? (
            <img src={state.preview} alt={t('install.brand.previewAlt')} className={styles.previewImg} />
          ) : (
            <Icon name="image" />
          )}
        </div>
        <div className={styles.text}>
          <h2 id={`${inputId}-title`} className={styles.title}>
            {t('install.brand.title')}
          </h2>
          <p className={styles.lead}>{t('install.brand.lead')}</p>
        </div>
      </div>

      <label htmlFor={inputId} className={styles.pick} aria-disabled={busy}>
        <Icon name="image" />
        {busy ? t('install.brand.preparing') : state.kind === 'ready' ? t('install.brand.change') : t('install.brand.pick')}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="visually-hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setLogo(file);
          void run(file, color);
        }}
      />

      <fieldset className={styles.swatches} disabled={busy}>
        <legend className={styles.legend}>{t('install.brand.color')}</legend>
        {BRAND_PRESETS.map((p) => (
          <label key={p.id} className={styles.swatch}>
            <input
              type="radio"
              name="install-brand-color"
              className="visually-hidden"
              value={p.hex}
              checked={color === p.hex}
              aria-label={t(`identity.color.names.${p.id}` as TKey)}
              onChange={() => {
                setColor(p.hex);
                if (logo) void run(logo, p.hex);
              }}
            />
            <span className={styles.dot} data-on={color === p.hex} style={{ background: p.hex }}>
              {color === p.hex && <Icon name="check" />}
            </span>
          </label>
        ))}
      </fieldset>

      {state.kind === 'ready' && (
        <div className={styles.ok} role="status">
          <Icon name="check" />
          <div>
            <p className={styles.okTitle}>{t('install.brand.ready')}</p>
            <p>{t('install.brand.readyHint')}</p>
          </div>
        </div>
      )}
      {state.kind === 'failed' && (
        <p className={styles.error} role="alert">
          {t('install.brand.failed')}
        </p>
      )}
      {state.kind === 'badImage' && (
        <p className={styles.error} role="alert">
          {t('install.brand.badImage')}
        </p>
      )}
      <p className={styles.privacy}>{t('install.brand.privacy')}</p>
    </section>
  );
}
