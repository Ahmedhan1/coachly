import { t } from '@/i18n';
import { PageHeader } from '@/ui';
import styles from './Settings.module.css';

const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

/** Attribution (Z-Anatomy CC BY-SA 4.0, exercise data, fonts) and the disclaimer. */
export function AboutScreen() {
  return (
    <>
      <PageHeader title={t('settings.aboutPage.title')} back={{ to: '/more/settings', label: t('screens.settings.title') }} subtitle={t('settings.aboutPage.version', { v: VERSION })} />
      <section className={styles.card}>
        {(['model', 'exercises', 'fonts', 'licenses', 'disclaimer'] as const).map((k) => (
          <p key={k} className={styles.body}>
            {t(`settings.aboutPage.${k}`)}
          </p>
        ))}
      </section>
    </>
  );
}
