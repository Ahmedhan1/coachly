import { getLocale, setLocale, t } from '@/i18n';
import { Icon } from '@/ui';
import styles from './AuthScreen.module.css';

/** Arabic/English switch for the screens before the app opens (Settings has the full one). */
export function LanguageToggle() {
  const other = getLocale() === 'en' ? 'ar' : 'en';
  return (
    <button
      type="button"
      className={styles.langToggle}
      lang={other}
      aria-label={t('settings.language.title')}
      data-testid="auth-language"
      onClick={() => setLocale(other)}
    >
      <Icon name="globe" />
      {other === 'ar' ? t('settings.language.ar') : t('settings.language.en')}
    </button>
  );
}
