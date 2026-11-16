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
import { createActivationService } from './activationFactory';
import { createAppRouter } from './router';
import { IDENTITY_SETUP_KEY, ServicesProvider, useServices, type AppServices } from './services';
import { browserStandaloneEnv, bypassAllowedInThisBuild, canSkipInstallGate } from './standalone';
import { useBrandTheme } from './useBrandTheme';
import { useLive } from './useLive';
import styles from './AppShell.module.css';

/** Real services for the browser. Activation: real license service in production (see activationFactory). */
export function createBrowserServices(): AppServices {
  const db = new AppDatabase();
  return {
    data: createDataLayer(db),
    storage: new BrowserStorageService(),
    activation: createActivationService(db),
    meta: dexieMetaStore(db),
    images: new CanvasImageDownscaler(),
  };
}

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

  useEffect(() => {
    let cancelled = false;
    const afterActivation = async () => {
      await services.data.ensureFirstRun(new Date());
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
  }, [services]);

  useEffect(() => {
    if (boot.phase === 'ready') void services.storage.requestPersistence();
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
  if (!installed) return <InstallGateScreen />;
  return (
    <ServicesProvider services={appServices}>
      <Boot />
    </ServicesProvider>
  );
}
