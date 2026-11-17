/**
 * Service worker registration and the "new version" flow (vite.config.ts: registerType 'prompt').
 *
 * - The first install activates at once and controls the page (clientsClaim), so the app is offline-ready.
 * - A later version installs in the background and WAITS. The trainer sees a banner; tapping it activates
 *   the new worker and reloads. If they ignore it, the new version takes over on the next cold start.
 * - iOS keeps a home-screen app alive in the background for days without navigating, and the browser only
 *   checks for a new sw.js on navigation, so we also check when the app comes back to the foreground.
 * - A lazy screen whose chunk can no longer be loaded (very old open page) reloads the app once instead of
 *   showing a broken screen.
 */

/** Minimal slice of ServiceWorkerRegistration used here (fake in tests). */
export interface UpdatableRegistration {
  update(): Promise<unknown>;
}

export interface UpdateCheckDeps {
  now: () => number;
  isOnline: () => boolean;
  isVisible: () => boolean;
  onVisible: (listener: () => void) => () => void;
  every: (ms: number, fn: () => void) => () => void;
}

/** Background checks are cheap (one sw.js request, no-cache) but there is no need for more than this. */
export const UPDATE_CHECK_MIN_GAP_MS = 30 * 60 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Calls `registration.update()` when the app returns to the foreground and hourly while visible, at most once
 * per UPDATE_CHECK_MIN_GAP_MS and never offline. Failures are silent. Returns a stop function.
 */
export function scheduleUpdateChecks(registration: UpdatableRegistration, deps: UpdateCheckDeps): () => void {
  let last = deps.now();
  const check = () => {
    if (!deps.isOnline() || !deps.isVisible()) return;
    const now = deps.now();
    if (now - last < UPDATE_CHECK_MIN_GAP_MS) return;
    last = now;
    registration.update().catch(() => undefined);
  };
  const stopVisible = deps.onVisible(check);
  const stopTimer = deps.every(UPDATE_CHECK_INTERVAL_MS, check);
  return () => {
    stopVisible();
    stopTimer();
  };
}

export interface ReloadGuardDeps {
  now: () => number;
  read: () => string | null;
  write: (value: string) => void;
  reload: () => void;
}

const RELOAD_GUARD_MS = 60 * 1000;

/**
 * Reloads once after a failed chunk load. A second failure within a minute does not reload again (no loop
 * when the device is offline and the chunk is truly missing). Returns true when it reloaded.
 */
export function reloadOnceAfterChunkError(deps: ReloadGuardDeps): boolean {
  const raw = deps.read();
  const now = deps.now();
  if (raw !== null) {
    const previous = Number(raw);
    if (Number.isFinite(previous) && now - previous < RELOAD_GUARD_MS) return false;
  }
  deps.write(String(now));
  deps.reload();
  return true;
}

const RELOAD_KEY = 'pt.chunkReloadAt';

function sessionValue(): { read: () => string | null; write: (v: string) => void } {
  return {
    read: () => {
      try {
        return sessionStorage.getItem(RELOAD_KEY);
      } catch {
        return null;
      }
    },
    write: (v) => {
      try {
        sessionStorage.setItem(RELOAD_KEY, v);
      } catch {
        // private mode / storage full: the guard just does not persist
      }
    },
  };
}

export interface AppServiceWorker {
  /** Activates the waiting version and reloads the page. */
  applyUpdate: () => Promise<void>;
}

/**
 * Registers /sw.js (production builds only) and wires the update flow. `onNeedRefresh` fires when a new
 * version is installed and waiting. Never throws; without service worker support it does nothing.
 */
export async function startAppServiceWorker(onNeedRefresh: () => void): Promise<AppServiceWorker | null> {
  if (typeof window === 'undefined') return null;
  window.addEventListener('vite:preloadError', (event) => {
    const session = sessionValue();
    if (reloadOnceAfterChunkError({ now: () => Date.now(), ...session, reload: () => window.location.reload() })) event.preventDefault();
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh,
      // The plugin reloads only for a worker it registered itself; one found by a background update() check
      // counts as "external" and would never reload. applyUpdate() reloads on controllerchange instead.
      onNeedReload: () => undefined,
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        scheduleUpdateChecks(registration, {
          now: () => Date.now(),
          isOnline: () => navigator.onLine !== false,
          isVisible: () => document.visibilityState === 'visible',
          onVisible: (listener) => {
            const handler = () => {
              if (document.visibilityState === 'visible') listener();
            };
            document.addEventListener('visibilitychange', handler);
            return () => document.removeEventListener('visibilitychange', handler);
          },
          every: (ms, fn) => {
            const id = window.setInterval(fn, ms);
            return () => window.clearInterval(id);
          },
        });
      },
    });
    return {
      applyUpdate: async () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        await updateSW(true);
      },
    };
  } catch {
    return null;
  }
}
