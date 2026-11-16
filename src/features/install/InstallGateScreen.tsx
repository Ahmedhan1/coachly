import { t, type TKey } from '@/i18n';
import { HomeScreenIllustration, SafariBarIllustration, ShareSheetIllustration } from './Illustrations';
import styles from './InstallGateScreen.module.css';

interface Step {
  title: TKey;
  body: TKey;
  art?: 'safari' | 'share' | 'home';
}

const STEPS: readonly Step[] = [
  { title: 'install.step1Title', body: 'install.step1Body' },
  { title: 'install.step2Title', body: 'install.step2Body', art: 'safari' },
  { title: 'install.step3Title', body: 'install.step3Body', art: 'share' },
  { title: 'install.step4Title', body: 'install.step4Body', art: 'home' },
];

/**
 * Shown whenever the app runs in a normal browser tab. iOS has no install prompt, so this
 * explains Share → Add to Home Screen and deliberately offers no way to continue.
 */
export function InstallGateScreen() {
  return (
    <main className={styles.page} data-testid="install-gate">
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          {t('app.name').charAt(0)}
        </span>
        <h1 className={styles.title}>{t('install.title')}</h1>
        <p className={styles.lead}>{t('install.lead')}</p>
      </header>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <div className={styles.stepText}>
              <h2 className={styles.stepTitle}>{t(step.title)}</h2>
              <p className={styles.stepBody}>{t(step.body)}</p>
              {step.art === 'safari' && <SafariBarIllustration label={t('install.shareIconLabel')} />}
              {step.art === 'share' && <ShareSheetIllustration label={t('install.addIconLabel')} />}
              {step.art === 'home' && (
                <HomeScreenIllustration label={t('install.homeIconLabel')} mark={t('app.name').charAt(0)} />
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.blocked}>{t('install.blocked')}</p>
    </main>
  );
}
