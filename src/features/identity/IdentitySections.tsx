import { useEffect, useId, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { useStoredImageUrl } from '@/features/files/useStoredImageUrl';
import { applyBrand } from '@/app/useBrandTheme';
import { auditBrand, BRAND_PRESETS, deriveBrand, normalizeHex } from '@/domain/branding';
import { t, type TKey } from '@/i18n';
import { Button, cx, Icon, Num, SegmentedControl, Select, TextField, Tx } from '@/ui';
import { timeParts } from '@/ui/format';
import { CURRENCIES, type IdentityDraft } from './identityDraft';
import styles from './Identity.module.css';

export interface SectionProps {
  draft: IdentityDraft;
  update: (patch: Partial<IdentityDraft>) => void;
}

export function NameSection({ draft, update, autoFocus }: SectionProps & { autoFocus?: boolean }) {
  return (
    <TextField
      label={t('identity.name.label')}
      placeholder={t('identity.name.placeholder')}
      value={draft.name}
      onChange={(e) => update({ name: e.target.value })}
      autoComplete="name"
      enterKeyHint="next"
      maxLength={60}
      autoFocus={autoFocus}
    />
  );
}

const useImageUrl = useStoredImageUrl;

const LOGO_MAX_SIDE = 512;

export function LogoSection({ draft, update }: SectionProps) {
  const { data, images } = useServices();
  const inputId = useId();
  const url = useImageUrl(draft.logoImageId);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState('busy');
    try {
      const small = await images.downscale(file, LOGO_MAX_SIDE);
      const saved = await data.repos.images.save(small);
      if (draft.logoImageId) await data.repos.images.delete(draft.logoImageId);
      update({ logoImageId: saved.id });
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={styles.logo}>
      <div className={styles.logoFrame}>
        {url ? <img src={url} alt={t('identity.logo.alt')} className={styles.logoImg} /> : <Icon name="image" />}
      </div>
      <div className={styles.logoActions}>
        <label htmlFor={inputId} className={styles.fileButton}>
          <Icon name="image" />
          {state === 'busy' ? t('identity.logo.processing') : draft.logoImageId ? t('identity.logo.change') : t('identity.logo.pick')}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {draft.logoImageId && (
          <Button
            variant="danger"
            size="small"
            onClick={async () => {
              const id = draft.logoImageId;
              update({ logoImageId: null });
              if (id) await data.repos.images.delete(id);
            }}
          >
            {t('identity.logo.remove')}
          </Button>
        )}
        {state === 'error' && (
          <p className={styles.error} role="alert">
            {t('identity.logo.error')}
          </p>
        )}
      </div>
    </div>
  );
}

export function ColorSection({ draft, update }: SectionProps) {
  const { data } = useServices();
  const [hexText, setHexText] = useState(draft.color);
  const [hexError, setHexError] = useState(false);
  const theme = useMemo(() => deriveBrand(draft.color), [draft.color]);
  const failing = useMemo(() => auditBrand(theme).some((c) => c.kind === 'text' && !c.ok), [theme]);

  // Live preview: the whole screen (buttons, tab bar, hero) follows the color being chosen.
  useEffect(() => applyBrand(draft.color), [draft.color]);
  // Leaving without saving: go back to the saved color.
  useEffect(() => () => void data.repos.settings.get().then((s) => applyBrand(s.primaryColor)), [data]);

  const choose = (hex: string) => {
    update({ color: hex });
    setHexText(hex);
    setHexError(false);
  };

  return (
    <div className={styles.color}>
      <fieldset className={styles.swatches}>
        <legend className={styles.legend}>{t('identity.color.presets')}</legend>
        {BRAND_PRESETS.map((p) => (
          <label key={p.id} className={styles.swatch} title={t(`identity.color.names.${p.id}` as TKey)}>
            <input
              type="radio"
              name="brand-color"
              className="visually-hidden"
              value={p.hex}
              checked={draft.color === p.hex}
              onChange={() => choose(p.hex)}
              aria-label={t(`identity.color.names.${p.id}` as TKey)}
            />
            <span className={cx(styles.dot, draft.color === p.hex && styles.dotOn)} style={{ background: p.hex }}>
              {draft.color === p.hex && <Icon name="check" />}
            </span>
          </label>
        ))}
      </fieldset>

      <div className={styles.custom}>
        <TextField
          label={t('identity.color.custom')}
          value={hexText}
          error={hexError ? t('identity.color.invalid') : null}
          onChange={(e) => {
            const text = e.target.value.slice(0, 7);
            setHexText(text);
            const hex = normalizeHex(text);
            setHexError(hex === null && text.replace('#', '').length >= 6);
            if (hex && text.replace('#', '').length === 6) update({ color: hex });
          }}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={7}
          className={styles.hexField}
          ltr
        />
        <label className={styles.picker} title={t('identity.color.picker')}>
          <input
            type="color"
            value={draft.color.toLowerCase()}
            onChange={(e) => {
              const hex = normalizeHex(e.target.value);
              if (hex) choose(hex);
            }}
            aria-label={t('identity.color.picker')}
          />
          <Icon name="palette" />
        </label>
      </div>

      <BrandPreview />
      {failing && (
        <p className={styles.warning} role="status">
          {t('identity.color.contrastWarning')}
        </p>
      )}
    </div>
  );
}

/** Mini version of the Home hero, drawn with the live brand tokens. */
function BrandPreview() {
  const { clock, period } = timeParts(new Date(2026, 0, 1, 17, 0).getTime());
  return (
    <figure className={styles.preview} aria-label={t('identity.color.preview')}>
      <div className={styles.previewHero}>
        <p className={styles.previewTop}>
          <Tx k="identity.color.previewNext" params={{ n: 40 }} />
        </p>
        <p className={styles.previewTime}>
          <Num>{clock}</Num>
          <small>{period}</small>
        </p>
        <p className={styles.previewWho}>{t('identity.color.previewClient')}</p>
        <span className={styles.previewButton}>
          <Icon name="timer" />
          {t('identity.color.previewStart')}
        </span>
      </div>
      <div className={styles.previewRow}>
        <span className={styles.previewChip}>
          <Tx k="identity.color.previewChip" params={{ n: 5 }} />
        </span>
        <span className={styles.previewLink}>{t('home.scheduleLink')}</span>
        <span className={styles.previewAdd}>
          <Icon name="plus" />
        </span>
      </div>
    </figure>
  );
}

export function UnitsSection({ draft, update }: SectionProps) {
  return (
    <div className={styles.units}>
      <Select
        label={t('identity.units.currency')}
        value={draft.currency}
        onChange={(currency) => update({ currency })}
        options={CURRENCIES.map((c) => ({ value: c, label: `${t(`currencyName.${c}`)} (${t(`currency.${c}`)})` }))}
      />
      <SegmentedControl
        label={t('identity.units.weight')}
        value={draft.weight}
        onChange={(weight) => update({ weight })}
        options={[
          { value: 'kg', label: t('identity.units.kg') },
          { value: 'lb', label: t('identity.units.lb') },
        ]}
      />
      <SegmentedControl
        label={t('identity.units.length')}
        value={draft.length}
        onChange={(length) => update({ length })}
        options={[
          { value: 'cm', label: t('identity.units.cm') },
          { value: 'in', label: t('identity.units.in') },
        ]}
      />
    </div>
  );
}

const PHOTO_MAX_SIDE = 800;

/** The trainer's own photo: round, shown to clients on their page next to the logo. */
export function TrainerPhotoSection({ draft, update }: SectionProps) {
  const { images, data } = useServices();
  const inputId = useId();
  const url = useImageUrl(draft.photoImageId);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState('busy');
    try {
      const saved = await data.repos.images.save(await images.downscale(file, PHOTO_MAX_SIDE));
      update({ photoImageId: saved.id });
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={styles.logo}>
      <div className={`${styles.logoFrame} ${styles.round}`}>
        {url ? <img src={url} alt={t('files.trainerPhoto.alt')} className={styles.photoImg} /> : <Icon name="user" />}
      </div>
      <div className={styles.logoActions}>
        <label htmlFor={inputId} className={styles.fileButton}>
          <Icon name="camera" />
          {state === 'busy' ? t('identity.logo.processing') : draft.photoImageId ? t('files.trainerPhoto.change') : t('files.trainerPhoto.pick')}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {draft.photoImageId && (
          <Button variant="danger" size="small" onClick={() => update({ photoImageId: null })}>
            {t('files.trainerPhoto.remove')}
          </Button>
        )}
        {state === 'error' && (
          <p className={styles.error} role="alert">
            {t('identity.logo.error')}
          </p>
        )}
      </div>
    </div>
  );
}
