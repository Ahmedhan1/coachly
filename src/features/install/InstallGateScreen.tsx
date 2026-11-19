import { useEffect, useMemo, useState } from 'react';
import { installPromptState, promptInstall, subscribeInstallPrompt } from '@/app/pwa/installPrompt';
import { t, type TKey } from '@/i18n';
import { Button, Icon } from '@/ui';
import {
  ChromeMenuIllustration,
  HomeScreenIllustration,
  SafariBarIllustration,
  ShareSheetIllustration,
} from './Illustrations';
import { BrandIconCard } from './BrandIconCard';
import { detectPlatform, type PlatformInfo } from './platform';
import styles from './InstallGateScreen.module.css';

interface Step {
  title: TKey;
  body: TKey;
  art?: 'safari' | 'share' | 'home' | 'chromeMenu';
}

const IOS_STEPS: readonly Step[] = [
  { title: 'install.step1Title', body: 'install.step1Body' },
  { title: 'install.step2Title', body: 'install.step2Body', art: 'safari' },
  { title: 'install.step3Title', body: 'install.step3Body', art: 'share' },
  { title: 'install.step4Title', body: 'install.step4Body', art: 'home' },
];

const ANDROID_STEPS: readonly Step[] = [
  { title: 'install.androidStep1Title', body: 'install.androidStep1Body' },
  { title: 'install.androidStep2Title', body: 'install.androidStep2Body' },
  { title: 'install.androidStep3Title', body: 'install.androidStep3Body', art: 'chromeMenu' },
  { title: 'install.androidStep4Title', body: 'install.androidStep4Body', art: 'home' },
];

function browserPlatform(): PlatformInfo {
  if (typeof navigator === 'undefined') return { platform: 'desktop', inAppBrowser: false };
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

function useInstallPrompt() {
  const [state, setState] = useState(installPromptState);
  useEffect(() => subscribeInstallPrompt(() => setState(installPromptState())), []);
  return state;
}

function StepArt({ art }: { art: Step['art'] }) {
  const mark = t('app.name').charAt(0);
  if (art === 'safari') return <SafariBarIllustration label={t('install.shareIconLabel')} />;
  if (art === 'share') return <ShareSheetIllustration label={t('install.addIconLabel')} />;
  if (art === 'chromeMenu') return <ChromeMenuIllustration label={t('install.androidMenuLabel')} />;
  if (art === 'home') return <HomeScreenIllustration label={t('install.homeIconLabel')} mark={mark} />;
  return null;
}

function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, i) => (
        <li key={step.title} className={styles.step}>
          <span className={styles.number} aria-hidden="true">
            <bdi className="num">{i + 1}</bdi>
          </span>
          <div className={styles.stepText}>
            <h2 className={styles.stepTitle}>{t(step.title)}</h2>
            <p className={styles.stepBody}>{t(step.body)}</p>
            <StepArt art={step.art} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shown whenever the app runs in a normal browser tab, and deliberately offers no way to continue: data must
 * live in the installed app. iPhone: Share → Add to Home Screen (no install API). Android/desktop Chrome:
 * a one-tap button when the browser offers `beforeinstallprompt`, plus the ⋮ menu steps as a fallback.
 */
export function InstallGateScreen({ platform: forced }: { platform?: PlatformInfo }) {
  const info = useMemo(() => forced ?? browserPlatform(), [forced]);
  const prompt = useInstallPrompt();
  const [busy, setBusy] = useState(false);

  const install = async () => {
    setBusy(true);
    await promptInstall();
    setBusy(false);
  };

  const mobile = info.platform !== 'desktop';
  return (
    <main className={styles.page} data-testid="install-gate" data-platform={info.platform}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          {t('app.name').charAt(0)}
        </span>
        <h1 className={styles.title}>{mobile ? t('install.title') : t('install.desktopTitle')}</h1>
        <p className={styles.lead}>
          {info.platform === 'ios' ? t('install.lead') : mobile ? t('install.leadAndroid') : t('install.desktopBody')}
        </p>
      </header>

      {prompt.installed ? (
        <div className={styles.callout} role="status">
          <Icon name="check" />
          <div>
            <p className={styles.calloutTitle}>{t('install.installedTitle')}</p>
            <p>{t('install.installedBody')}</p>
          </div>
        </div>
      ) : (
        prompt.canPrompt && (
          <div className={styles.installBox}>
            {!mobile && <p className={styles.stepBody}>{t('install.desktopInstall')}</p>}
            <Button icon="download" size="large" block onClick={() => void install()} disabled={busy}>
              {t('install.installButton')}
            </Button>
            {mobile && <p className={styles.installHint}>{t('install.installButtonHint')}</p>}
          </div>
        )
      )}

      {info.platform === 'ios' && info.inAppBrowser && (
        <div className={styles.callout} role="note">
          <Icon name="alert" />
          <div>
            <p className={styles.calloutTitle}>{t('install.iosInAppTitle')}</p>
            <p>{t('install.iosInAppBody')}</p>
          </div>
        </div>
      )}

      {mobile && !prompt.installed && <BrandIconCard />}

      {info.platform === 'ios' && <Steps steps={IOS_STEPS} />}
      {info.platform === 'android' && <Steps steps={ANDROID_STEPS} />}
      <p className={styles.blocked}>{t('install.blocked')}</p>
    </main>
  );
}
