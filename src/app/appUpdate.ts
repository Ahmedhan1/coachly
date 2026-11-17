/**
 * Keeps installed copies of the app current. The service worker (vite-plugin-pwa, skipWaiting + clientsClaim)
 * installs a new version in the background, but the open page keeps running the old JavaScript. Without this,
 * a phone could run an outdated build for days (that is how an old build without the server address kept
 * failing every activation).
 *
 * Policy: switch to the new version immediately while a gate screen is showing (install/activation — nothing
 * to lose). Anywhere else, wait until the trainer comes back after the app sat in the background for a while
 * (AWAY_MS): a quick hop to WhatsApp and back must never wipe a half-filled form or a running workout. A cold
 * start always runs the newest version anyway.
 *
 * No double reload with vite-plugin-pwa: its `script-defer` registerSW.js only registers the worker and never
 * reloads, and `controllerchange` fires once per new worker, so the reloaded page (already controlled by the
 * new worker) sees no further change.
 */

/** How long the app must have been in the background before a pending update reloads it on return. */
export const AWAY_MS = 3 * 60 * 1000;

let reloadSafe = false;
let pendingReload = false;
let started = false;
let hiddenAt: number | null = null;

/** Gate screens call this while mounted: a new version may then reload the page at once. */
export function setReloadSafe(value: boolean): void {
  reloadSafe = value;
  if (value && pendingReload) window.location.reload();
}

/** Asks the browser to look for a new service worker now. Never throws. */
export async function checkForAppUpdate(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // Offline or unsupported: the next check will try again.
  }
}

export function startAppUpdates(): void {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  started = true;
  let hadController = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also fires this; the page already runs that version.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloadSafe) window.location.reload();
    else pendingReload = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (pendingReload && (reloadSafe || away >= AWAY_MS)) window.location.reload();
    else void checkForAppUpdate();
  });

  void checkForAppUpdate();
}
