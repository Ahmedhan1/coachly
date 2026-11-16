import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import { t, type TKey } from '@/i18n';
import { Button, PageHeader } from '@/ui';
import { useIdentityDraft } from './identityDraft';
import { ColorSection, LogoSection, NameSection, UnitsSection } from './IdentitySections';
import styles from './Identity.module.css';

const SECTIONS = [
  { key: 'name', Body: NameSection },
  { key: 'logo', Body: LogoSection },
  { key: 'color', Body: ColorSection },
  { key: 'units', Body: UnitsSection },
] as const;

/** Settings → identity: the same four parts as first-run setup, on one page. */
export function IdentityEditScreen() {
  const { draft, update, save } = useIdentityDraft(false);
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [saving, setSaving] = useState(false);
  const back = { to: '/more/settings', label: t('screens.settings.title') };
  if (!draft) return <PageHeader title={t('screens.settings.identity')} back={back} />;
  return (
    <>
      <PageHeader title={t('screens.settings.identity')} back={back} />
      <div className={styles.editBody}>
        {SECTIONS.map(({ key, Body }) => (
          <section key={key} className={`${styles.editSection} ${styles.editSave}`} aria-labelledby={`identity-${key}`}>
            <h2 id={`identity-${key}`} className={styles.editTitle}>
              {t(`identity.${key}.title` as TKey)}
            </h2>
            <Body draft={draft} update={update} />
          </section>
        ))}
        <div className={styles.editSave}>
          <Button
            size="large"
            block
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await save(draft);
              showToast({ message: t('screens.settings.saved') });
              navigate('/more/settings');
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </>
  );
}
