/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  /** "1" in the e2e build: enables the ?standalone=1 install-gate bypass, the guest button and ?worker=. */
  readonly VITE_E2E?: string;
  /** Account/cloud Worker base URL, e.g. https://api.getcoachly.<account>.workers.dev (or http://localhost:8787). */
  readonly VITE_WORKER_URL?: string;
  readonly VITE_APP_VERSION?: string;
  /** Set by vite.config.ts at build time: build date + git commit. */
  readonly VITE_BUILD_ID?: string;
}

interface Navigator {
  /** iOS Safari: true when launched from the home screen. */
  readonly standalone?: boolean;
}
