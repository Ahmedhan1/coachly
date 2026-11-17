/**
 * What the app shell needs from licensing. Real implementation: src/services/license (wraps
 * src/domain/license + shared/license.ts and the Worker API). FakeActivationService is for tests/e2e only.
 */
export type LockReason = 'expired' | 'revoked' | 'clock_rollback';

export type ActivationState =
  | { status: 'inactive' }
  /** `expiresAt` is unix milliseconds, null = lifetime. */
  | { status: 'active'; licenseId: string; trainerName: string; expiresAt: number | null }
  | { status: 'locked'; reason: LockReason };

export type ActivationError =
  | 'invalid'
  | 'used'
  | 'expired'
  | 'rate_limited'
  | 'offline'
  | 'unavailable'
  | 'malformed'
  | 'wrong_device'
  | 'clock';

export type ActivationResult =
  | { ok: true; state: ActivationState }
  /** `detail` is a short technical hint (e.g. "HTTP 500", "network") shown small under the message for support. */
  | { ok: false; error: ActivationError; detail?: string };

export interface ActivationService {
  /** Current state, verified offline on every launch. Never needs the network. */
  getState(): Promise<ActivationState>;
  /** Short `XXXX-XXXX-XXXX` code (online) or `PT1.` long code (offline fallback). */
  activate(code: string): Promise<ActivationResult>;
  /** Install-time random id; the trainer sends it to the owner to get an offline long code. */
  getDeviceId(): Promise<string>;
  /**
   * Background check with the server (only when online). Resolves to the new state when the server's
   * answer changed it (explicit `revoked: true`), otherwise null. Never throws.
   */
  checkRevocation(): Promise<ActivationState | null>;
}
