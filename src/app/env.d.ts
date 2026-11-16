/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in the e2e build: enables the ?standalone=1 install-gate bypass and the fake activation service. */
  readonly VITE_E2E?: string;
  /** "1" in `npm run dev` only: use the fake activation service (any well-formed short code). */
  readonly VITE_FAKE_ACTIVATION?: string;
  /** License Worker base URL, e.g. https://pt-coach-license.<account>.workers.dev */
  readonly VITE_WORKER_URL?: string;
}

interface Navigator {
  /** iOS Safari: true when launched from the home screen. */
  readonly standalone?: boolean;
}
