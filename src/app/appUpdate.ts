/**
 * Keeps installed copies of the app current. The service worker (vite-plugin-pwa, skipWaiting + clientsClaim)
 * installs a new version in the background, but the open page keeps running the old JavaScript. Without this,
 * a phone could run an outdated build for days (that is how an old build without the server address kept
 * failing every activation).
 *
 * Policy: switch to the new version immediately while a gate screen is showing (install/activation — nothing
 * to lose), or while the app is in the background; otherwise wait until the trainer comes back to the app,
 * so a reload never interrupts typing or a workout.
 */

let reloadSafe = false;
let pendingReload = false;
let started = false;

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
    if (reloadSafe || document.visibilityState === 'hidden') window.location.reload();
    else pendingReload = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pendingReload) window.location.reload();
    else void checkForAppUpdate();
  });

  void checkForAppUpdate();
}
