import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { createDataLayer } from '@/data';
import { ActivationScreen } from '@/features/activation/ActivationScreen';
import { InstallGateScreen } from '@/features/install/InstallGateScreen';
import { t } from '@/i18n';
import { FakeActivationService } from '@/services/activation/fakeActivationService';
import type { ActivationState } from '@/services/activation/types';
import { BrowserStorageService } from '@/services/storage';
import { createAppRouter } from './router';
import { ServicesProvider, useServices, type AppServices } from './services';
import { browserStandaloneEnv, bypassAllowedInThisBuild, canSkipInstallGate } from './standalone';
import styles from './AppShell.module.css';

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Real services for the browser. Activation uses the fake until the license service lands (phase 3). */
export function createBrowserServices(): AppServices {
  return {
    data: createDataLayer(),
    storage: new BrowserStorageService(),
    activation: new FakeActivationService(safeLocalStorage()),
  };
}

type Boot = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; activation: ActivationState };

function Boot() {
  const services = useServices();
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [router] = useState(createAppRouter);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const activation = await services.activation.getState();
        if (activation.status === 'active') await services.data.ensureFirstRun(new Date());
        if (!cancelled) setBoot({ phase: 'ready', activation });
      } catch {
        if (!cancelled) setBoot({ phase: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services]);

  useEffect(() => {
    if (boot.phase === 'ready' && boot.activation.status === 'active') {
      void services.storage.requestPersistence();
    }
  }, [boot, services]);

  if (boot.phase === 'loading') return <p className={styles.fallback}>{t('app.loading')}</p>;
  if (boot.phase === 'error') return <p className={styles.fallback}>{t('app.loadError')}</p>;
  if (boot.activation.status !== 'active') {
    return (
      <ActivationScreen
        onActivated={async (activation) => {
          await services.data.ensureFirstRun(new Date());
          setBoot({ phase: 'ready', activation });
        }}
      />
    );
  }
  return <RouterProvider router={router} />;
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
