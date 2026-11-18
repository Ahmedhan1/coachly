import './zodConfig';
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppDatabase, createDataLayer } from '@/data';
import { ActivationScreen } from '@/features/activation/ActivationScreen';
import { IdentitySetupScreen } from '@/features/identity/IdentitySetupScreen';
import { InstallGateScreen } from '@/features/install/InstallGateScreen';
import { t } from '@/i18n';
import type { LockReason } from '@/services/activation/types';
import { dexieMetaStore } from '@/services/license/metaStore';
import { BrowserStorageService, CanvasImageDownscaler } from '@/services/storage';
import { createBackupServices } from '@/services/backup';
import { ClientPageService } from '@/services/clientPage/clientPageService';
import { BrowserNetworkStatus } from '@/services/cloud/networkStatus';
import { WorkerApi } from '@/services/cloud/workerApi';
import { BrowserPushService } from '@/services/push/pushService';
import { META_KEYS } from '@/services/license/licenseActivationService';
import { buildEnv, createActivationService } from './activationFactory';
import { afterFirstPaint } from './afterFirstPaint';
import { importHostedBrand } from '@/features/identity/hostedBrand';
import { HttpBrandHosting } from '@/services/brand/brandHosting';
import { createAppRouter } from './router';
import { CLOUD_PASSWORD_KEY, IDENTITY_SETUP_KEY, ServicesProvider, useServices, type AppServices } from './services';

const LICENSE_TOKEN_KEY = META_KEYS.token;
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';
import { browserStandaloneEnv, bypassAllowedInThisBuild, canSkipInstallGate } from './standalone';
import { UpdateBanner } from './UpdateBanner';
import { useBrandTheme } from './useBrandTheme';
import { useOnlineSync } from '@/features/online/useOnlineSync';
import { useLive } from './useLive';
import styles from './AppShell.module.css';

/** Real services for the browser. Activation: real license service in production (see activationFactory). */
export function createBrowserServices(): AppServices {
  const db = new AppDatabase();
  const meta = dexieMetaStore(db);
  const images = new CanvasImageDownscaler();
  const text = async (key: string) => {
    const v = await meta.get(key);
    return typeof v === 'string' && v ? v : null;
  };
  const tokens = { getToken: () => text(LICENSE_TOKEN_KEY) };
  const api = new WorkerApi({ baseUrl: buildEnv.workerUrl, tokens, network: new BrowserNetworkStatus() });
  return {
    online: { push: new BrowserPushService(api), clientPage: new ClientPageService(api) },
    data: createDataLayer(db),
    storage: new BrowserStorageService(),
    activation: createActivationService(db),
    meta,
    images,
    backup: createBackupServices({
      db,
      appVersion: APP_VERSION,
      tokens,
      passwords: { getPassword: () => text(CLOUD_PASSWORD_KEY) },
      downscaler: images,
      workerBaseUrl: buildEnv.workerUrl,
    }),
  };
}

/** Waits for a background step, but never longer than `ms` (a slow network must not hold the app). */
const settle = (p: Promise<unknown>, ms = 5000) => Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))]);

type BootPhase =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'activation'; locked: LockReason | null }
  | { phase: 'setup' }
  | { phase: 'ready' };

function Boot() {
  const services = useServices();
  const [boot, setBoot] = useState<BootPhase>({ phase: 'loading' });
  const [router] = useState(createAppRouter);
  const settings = useLive(() => services.data.repos.settings.get(), [services]);
  useBrandTheme(boot.phase === 'ready' ? settings?.primaryColor : undefined);
  useOnlineSync(boot.phase === 'ready');

  // Installed from a branded install page (/?brand=<id>): bring the logo and colour in before the setup wizard.
  const [brandImport] = useState(() => importHostedBrand(services, new HttpBrandHosting(), window.location.search).catch(() => false));

  useEffect(() => {
    let cancelled = false;
    const afterActivation = async () => {
      await services.data.ensureFirstRun(new Date());
      await settle(brandImport);
      const done = await services.meta.get(IDENTITY_SETUP_KEY);
      if (!cancelled) setBoot(done ? { phase: 'ready' } : { phase: 'setup' });
    };
    (async () => {
      try {
        const state = await services.activation.getState();
        if (state.status === 'active') {
          await afterActivation();
          // Background: lock only if the server explicitly says the license was revoked.
          void services.activation.checkRevocation().then((next) => {
            if (!cancelled && next && next.status === 'locked') setBoot({ phase: 'activation', locked: next.reason });
          });
        } else if (!cancelled) {
          setBoot({ phase: 'activation', locked: state.status === 'locked' ? state.reason : null });
        }
      } catch {
        if (!cancelled) setBoot({ phase: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, brandImport]);

  // The daily purge of old soft-deleted rows waits until the first screen has painted and the main thread is idle.
  useEffect(() => {
    if (boot.phase !== 'ready') return;
    return afterFirstPaint(() => void services.data.runDailyPurge(new Date()).catch(() => undefined));
  }, [boot.phase, services]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    void services.storage.requestPersistence();
    return services.backup?.start();
  }, [boot.phase, services]);

  switch (boot.phase) {
    case 'loading':
      return <p className={styles.fallback}>{t('app.loading')}</p>;
    case 'error':
      return <p className={styles.fallback}>{t('app.loadError')}</p>;
    case 'activation':
      return (
        <ActivationScreen
          locked={boot.locked}
          onActivated={async () => {
            await services.data.ensureFirstRun(new Date());
            await settle(brandImport);
            const done = await services.meta.get(IDENTITY_SETUP_KEY);
            setBoot(done ? { phase: 'ready' } : { phase: 'setup' });
          }}
        />
      );
    case 'setup':
      return <IdentitySetupScreen onDone={() => setBoot({ phase: 'ready' })} />;
    case 'ready':
      return <RouterProvider router={router} />;
  }
}

export function App({ services }: { services?: AppServices }) {
  const [installed] = useState(() => canSkipInstallGate(browserStandaloneEnv(), bypassAllowedInThisBuild));
  const [appServices] = useState(() => services ?? createBrowserServices());
  // The service worker is registered on the install gate too, so the app is cached before "Add to Home Screen".
  if (!installed)
    return (
      <>
        <InstallGateScreen />
        <UpdateBanner />
      </>
    );
  return (
    <ServicesProvider services={appServices}>
      <Boot />
      <UpdateBanner />
    </ServicesProvider>
  );
}
