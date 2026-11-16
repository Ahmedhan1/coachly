const BYPASS_KEY = 'pt-coach.standalone-bypass';

export interface StandaloneEnv {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean };
  search: string;
  session: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** True when launched from the home screen (iOS `navigator.standalone` or display-mode). */
export function isStandaloneDisplay(env: Pick<StandaloneEnv, 'matchMedia' | 'navigator'>): boolean {
  return env.navigator.standalone === true || env.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Whether the install gate may be skipped. Only dev and e2e builds honour `?standalone=1`;
 * the flag is remembered for the tab so in-app navigation keeps working.
 */
export function canSkipInstallGate(env: StandaloneEnv, bypassAllowed: boolean): boolean {
  if (isStandaloneDisplay(env)) return true;
  if (!bypassAllowed) return false;
  try {
    if (new URLSearchParams(env.search).get('standalone') === '1') {
      env.session?.setItem(BYPASS_KEY, '1');
      return true;
    }
    return env.session?.getItem(BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

export const bypassAllowedInThisBuild = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

export function browserStandaloneEnv(): StandaloneEnv {
  let session: Storage | null = null;
  try {
    session = window.sessionStorage;
  } catch {
    session = null;
  }
  return {
    matchMedia: (q) => window.matchMedia(q),
    navigator: window.navigator,
    search: window.location.search,
    session,
  };
}
