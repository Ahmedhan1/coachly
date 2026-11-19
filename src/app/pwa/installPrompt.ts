/**
 * Chrome/Edge on Android and desktop fire `beforeinstallprompt` when the app is installable. It can fire
 * before React mounts, so the listener is registered as soon as this module loads (App imports it) and the
 * event is kept for the install gate's one-tap button. iOS Safari never fires it.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // keep it for our own button instead of Chrome's mini-infobar
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export interface InstallPromptState {
  /** A one-tap install is available right now. */
  canPrompt: boolean;
  /** The browser reported that the app was just installed from this tab. */
  installed: boolean;
}

export function installPromptState(): InstallPromptState {
  return { canPrompt: deferred !== null, installed };
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog. Resolves 'unavailable' when there is no saved event. Never throws. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (event === null) return 'unavailable';
  deferred = null; // an event can be used once
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
