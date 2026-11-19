import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import { t, type TKey } from '@/i18n';
import { Button, PageHeader, TitleIcon } from '@/ui';
import { useIdentityDraft } from './identityDraft';
import { IconLinkSheet, useIconHint } from './IconHint';
import { ColorSection, LogoSection, NameSection, TrainerPhotoSection, UnitsSection } from './IdentitySections';
import styles from './Identity.module.css';

const SECTIONS = [
  { key: 'name', Body: NameSection },
  { key: 'logo', Body: LogoSection },
  { key: 'color', Body: ColorSection },
  { key: 'units', Body: UnitsSection },
] as const;

const SECTION_ICONS = { name: 'user', logo: 'image', color: 'palette', units: 'ruler' } as const;

/** Settings → identity: the same four parts as first-run setup, on one page. */
export function IdentityEditScreen() {
  const { draft, update, save } = useIdentityDraft(false);
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [saving, setSaving] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const hint = useIconHint(() => navigate('/more/settings'));
  const back = { to: '/more/settings', label: t('screens.settings.title') };
  if (!draft) return <PageHeader title={t('screens.settings.identity')} back={back} />;
  return (
    <>
      <PageHeader title={t('screens.settings.identity')} back={back} />
      <div className={styles.editBody}>
        {SECTIONS.map(({ key, Body }) => (
          <section key={key} className={`${styles.editSection} ${styles.editSave}`} aria-labelledby={`identity-${key}`}>
            <h2 id={`identity-${key}`} className={styles.editTitle}><TitleIcon name={SECTION_ICONS[key]} />
              {t(`identity.${key}.title` as TKey)}
            </h2>
            <Body draft={draft} update={update} />
            {key === 'logo' && draft.logoImageId && (
              <Button icon="image"
                variant="secondary"
                block
                className={styles.iconButton}
                disabled={saving}
                onClick={async () => {
                  // The icon is built from the saved logo: save first, then offer the install link.
                  setSaving(true);
                  await save(draft);
                  setSaving(false);
                  setIconOpen(true);
                }}
              >
                {t('identity.logo.iconUpdate')}
              </Button>
            )}
          </section>
        ))}
        <section className={`${styles.editSection} ${styles.editSave}`} aria-labelledby="identity-photo">
          <h2 id="identity-photo" className={styles.editTitle}><TitleIcon name="camera" />
            {t('files.trainerPhoto.title')}
          </h2>
          <p className={styles.editLead}>{t('files.trainerPhoto.lead')}</p>
          <TrainerPhotoSection draft={draft} update={update} />
        </section>
        <div className={styles.editSave}>
          <Button icon="check"
            size="large"
            block
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await save(draft);
              showToast({ message: t('screens.settings.saved') });
              if (!(await hint.afterSave())) navigate('/more/settings');
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
      {hint.sheet}
      <IconLinkSheet open={iconOpen} onClose={() => setIconOpen(false)} />
    </>
  );
}
