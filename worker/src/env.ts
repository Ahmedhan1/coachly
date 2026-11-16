export interface Env {
  DB: D1Database;
  /** R2 bucket: cloud backups, client pages and check-ins (all ciphertext). */
  BACKUPS: R2Bucket;
  /** Secret: Ed25519 private key, 64 hex chars. */
  LICENSE_PRIVATE_KEY: string;
  /** Var: Ed25519 public key, 64 hex chars. */
  LICENSE_PUBLIC_KEY: string;
  /** Secret: password for /admin. */
  ADMIN_PASSWORD: string;
  /** Secret: key for the app's data pack, returned on activation. */
  DATA_KEY: string;
  /** Var: allowed app origin(s), comma separated. The first one serves /exercise-pack/img/ to the client page. */
  APP_ORIGIN: string;
  /** Secret: VAPID private key (base64url, 32 bytes) from `npm run vapid:keys`. */
  VAPID_PRIVATE_KEY?: string;
  /** Secret (or var): VAPID public key (base64url, 65 bytes). */
  VAPID_PUBLIC_KEY?: string;
  /** Secret (or var): contact for push services, `mailto:...` or `https://...`. */
  VAPID_SUBJECT?: string;
  /** Var: per-trainer cloud backup cap in bytes (default 100 MiB). */
  BACKUP_MAX_BYTES?: string;
  /** Var: total R2 bytes above which uploads that would grow storage are refused (default 9 GiB). */
  STORAGE_GUARD_BYTES?: string;
}
