/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in the e2e build: enables the ?standalone=1 install-gate bypass. */
  readonly VITE_E2E?: string;
}

interface Navigator {
  /** iOS Safari: true when launched from the home screen. */
  readonly standalone?: boolean;
}
