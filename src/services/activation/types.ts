/**
 * What the app shell needs from licensing. The real implementation (phase 3) wraps
 * src/domain/license + shared/license.ts and the Worker API; until then a fake is used.
 */
export type ActivationState =
  | { status: 'inactive' }
  | { status: 'active'; licenseId: string; trainerName: string; expiresAt: number | null }
  | { status: 'locked'; reason: 'expired' | 'revoked' | 'clock_rollback' };

export type ActivationError = 'invalid' | 'used' | 'expired' | 'rate_limited' | 'offline' | 'malformed';

export type ActivationResult = { ok: true; state: ActivationState } | { ok: false; error: ActivationError };

export interface ActivationService {
  /** Current state, verified offline. Never needs the network. */
  getState(): Promise<ActivationState>;
  /** Short `XXXX-XXXX-XXXX` code (online) or `PT1.` long code (offline fallback). */
  activate(code: string): Promise<ActivationResult>;
}
