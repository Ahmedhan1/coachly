import './zodConfig';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppDatabase, createDataLayer } from '@/data';
import { AccountGateScreen } from '@/features/auth/AccountGateScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { IdentitySetupScreen } from '@/features/identity/IdentitySetupScreen';
import { InstallGateScreen } from '@/features/install/InstallGateScreen';
import { t } from '@/i18n';
import { canUseApp, type Account, type AuthError, type AuthState } from '@/domain/account';
import { dexieMetaStore } from '@/services/meta/metaStore';
import { BrowserStorageService, CanvasImageDownscaler } from '@/services/storage';
import { createBackupServices } from '@/services/backup';
import { ClientPageService } from '@/services/clientPage/clientPageService';
import { BrowserNetworkStatus } from '@/services/cloud/networkStatus';
import { WorkerApi } from '@/services/cloud/workerApi';
import { FileSyncService, HttpCloudFilesClient } from '@/services/files';
import { BrowserPushService } from '@/services/push/pushService';
import { TeamService } from '@/services/team/teamService';
import { AUTH_META_KEYS } from '@/services/auth/workerAuthService';
import { buildEnv, createAuthService } from './authFactory';
import { afterFirstPaint } from './pwa/afterFirstPaint';
import { importHostedBrand } from '@/features/identity/hostedBrand';
import { joinRememberedInvite, rememberInvite } from '@/features/team/joinInvite';
import { HttpBrandHosting } from '@/services/brand/brandHosting';
import { createAppRouter } from './shell/router';
import { CLOUD_PASSWORD_KEY, IDENTITY_SETUP_KEY, ServicesProvider, useServices, type AppServices } from './services';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';
import { browserStandaloneEnv, bypassAllowedInThisBuild, canSkipInstallGate } from './pwa/standalone';
import { UpdateBanner } from './pwa/UpdateBanner';
import { useBrandTheme } from './useBrandTheme';
import { useOnlineSync } from '@/features/online/useOnlineSync';
import { useLive } from './useLive';
import styles from './shell/AppShell.module.css';

/** Real services for the browser. Accounts: the Worker's better-auth API (see authFactory). */
export function createBrowserServices(): AppServices {
  const db = new AppDatabase();
  const meta = dexieMetaStore(db);
  const images = new CanvasImageDownscaler();
  const text = async (key: string) => {
    const v = await meta.get(key);
    return typeof v === 'string' && v ? v : null;
  };
  const tokens = { getToken: () => text(AUTH_META_KEYS.token) };
  const network = new BrowserNetworkStatus();
  const api = new WorkerApi({ baseUrl: buildEnv.workerUrl, tokens, network });
  // Photos and PDFs are bigger than the JSON calls: a longer (still bounded) timeout for the files API.
  const filesApi = new WorkerApi({ baseUrl: buildEnv.workerUrl, tokens, network, timeoutMs: 60_000 });
  const data = createDataLayer(db);
  const files = new FileSyncService({
    client: new HttpCloudFilesClient(filesApi),
    files: data.repos.cloudFiles,
    images: data.repos.images,
    meta,
    downscaler: images,
    now: () => Date.now(),
  });
  return {
    online: { push: new BrowserPushService(api), clientPage: new ClientPageService(api), files, team: new TeamService(api, meta, window.location.origin) },
    data,
    storage: new BrowserStorageService(),
    auth: createAuthService(db),
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
  | { phase: 'signIn'; error: AuthError | null }
  | { phase: 'gate'; account: Account }
  | { phase: 'setup' }
  | { phase: 'ready' };

/** Removes `#auth=…` / `#auth_error=…` from the address bar (and history) once it has been read. */
function clearAuthFragment(): void {
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  } catch {
    // Not fatal: the fragment is single-use anyway.
  }
}

function Boot() {
  const services = useServices();
  const [boot, setBoot] = useState<BootPhase>({ phase: 'loading' });
  const ready = boot.phase === 'ready';
  // The router reads the address on creation: build it only once ready (the auth fragment is gone by then).
  const router = useMemo(() => (ready ? createAppRouter() : null), [ready]);
  const settings = useLive(() => services.data.repos.settings.get(), [services]);
  useBrandTheme(boot.phase === 'ready' ? settings?.primaryColor : undefined);
  useOnlineSync(boot.phase === 'ready');

  // Installed from a branded install page (/?brand=<id>): bring the logo and colour in before the setup wizard.
  const [brandImport] = useState(() => importHostedBrand(services, new HttpBrandHosting(), window.location.search).catch(() => false));

  /** Where an auth state leads: the app (after first-run setup), the approval gate, or the sign-in screen. */
  const route = useCallback(
    async (state: AuthState, error: AuthError | null = null): Promise<BootPhase> => {
      if (state.status === 'signedOut') return { phase: 'signIn', error };
      if (state.status === 'signedIn' && !canUseApp(state, new Date())) return { phase: 'gate', account: state.account };
      await services.data.ensureFirstRun(new Date());
      await settle(brandImport);
      const done = await services.meta.get(IDENTITY_SETUP_KEY);
      return done ? { phase: 'ready' } : { phase: 'setup' };
    },
    [services, brandImport],
  );

  const go = useCallback(
    async (state: AuthState) => {
      // A gym invite opened before signing in is used right after (it may change the account's gym and status).
      const joined = state.status === 'signedIn' ? await settle(joinRememberedInvite(services)) : null;
      setBoot(await route(joined ? await services.auth.getState() : state));
    },
    [route, services],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Opened from a gym's invite link: remember it; it is used once the trainer is signed in.
        if (await rememberInvite(services.meta, window.location.hash)) clearAuthFragment();
        // Back from Google sign-in on the Worker: trade the one-time token for the session.
        const redirect = await services.auth.completeRedirect(window.location.hash);
        if (redirect !== null) clearAuthFragment();
        if (redirect === null || redirect.ok) await settle(joinRememberedInvite(services));
        const state = await services.auth.getState();
        const next = await route(state, redirect !== null && !redirect.ok ? redirect.error : null);
        if (cancelled) return;
        setBoot(next);
        // Background: the owner may have disabled the account, or its session ended. Never blocks the app.
        if (canUseApp(state, new Date())) {
          void services.auth.refresh().then(async (changed) => {
            if (!cancelled && changed !== null && !canUseApp(changed, new Date())) setBoot(await route(changed));
          });
        }
      } catch {
        if (!cancelled) setBoot({ phase: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, route]);

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
    case 'signIn':
      return <SignInScreen initialError={boot.error} onSignedIn={go} />;
    case 'gate':
      return <AccountGateScreen account={boot.account} onChange={go} />;
    case 'setup':
      return <IdentitySetupScreen onDone={() => setBoot({ phase: 'ready' })} />;
    case 'ready':
      return router === null ? <p className={styles.fallback}>{t('app.loading')}</p> : <RouterProvider router={router} />;
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
