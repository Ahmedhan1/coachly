import type { AppDatabase } from '@/data';
import type { AuthService } from '@/services/auth/types';
import { WorkerAuthService } from '@/services/auth/workerAuthService';
import { resolveWorkerUrl } from '@/services/cloud/serverConfig';
import { dexieMetaStore } from '@/data/metaStore';

export interface BuildEnv {
  e2e: boolean;
  dev: boolean;
  workerUrl: string | undefined;
}

const E2E_WORKER_STORAGE = 'pt-coach.e2e-worker';

/**
 * e2e build only: `?worker=<https url>` (kept for the tab in sessionStorage) points the app at a server the
 * Playwright test mocks, so sign-in and teams are tested end to end without touching the other e2e specs.
 * `http://127.0.0.1:<port>` is a real local mock (e2e/servers.ts), for tests that keep the service worker.
 */
function e2eWorkerUrl(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('worker');
    if (fromUrl && /^(https:\/\/[^\s/]+|http:\/\/127\.0\.0\.1:\d+)$/.test(fromUrl)) window.sessionStorage.setItem(E2E_WORKER_STORAGE, fromUrl);
    return window.sessionStorage.getItem(E2E_WORKER_STORAGE) ?? undefined;
  } catch {
    return undefined;
  }
}

export const buildEnv: BuildEnv = {
  e2e: import.meta.env.VITE_E2E === '1',
  dev: import.meta.env.DEV,
  // Always a real address in production: the committed default unless the build overrides it. The e2e build
  // talks to no server unless it is given one.
  workerUrl:
    import.meta.env.VITE_E2E === '1'
      ? (e2eWorkerUrl() ?? (import.meta.env.VITE_WORKER_URL || undefined))
      : resolveWorkerUrl(import.meta.env.VITE_WORKER_URL),
};

/** "Continue as guest" exists only in `npm run dev` and the e2e build. Production builds never show it. */
export function guestAllowedIn(env: Pick<BuildEnv, 'dev' | 'e2e'>): boolean {
  return env.dev || env.e2e;
}

export function createAuthService(db: AppDatabase, env: BuildEnv = buildEnv): AuthService {
  return new WorkerAuthService({
    store: dexieMetaStore(db),
    workerUrl: env.workerUrl,
    appOrigin: window.location.origin,
    fetch: (input, init) => window.fetch(input, init),
    isOnline: () => navigator.onLine !== false,
    guestAllowed: guestAllowedIn(env),
  });
}
