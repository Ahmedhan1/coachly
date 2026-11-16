export interface Env {
  DB: D1Database;
  /** Secret: Ed25519 private key, 64 hex chars. */
  LICENSE_PRIVATE_KEY: string;
  /** Var: Ed25519 public key, 64 hex chars. */
  LICENSE_PUBLIC_KEY: string;
  /** Secret: password for /admin. */
  ADMIN_PASSWORD: string;
  /** Secret: key for the app's data pack, returned on activation. */
  DATA_KEY: string;
  /** Var: allowed app origin(s), comma separated. */
  APP_ORIGIN: string;
}
