import { deviceFingerprint, verifyLicenseToken, type LicensePayload } from '../../../shared/license';

/** How far the clock may go back (vs. the latest time the app has seen) before a time-limited license locks. */
export const CLOCK_ROLLBACK_TOLERANCE_SECONDS = 24 * 60 * 60;

export type LicenseInvalidReason =
  | 'malformed'
  | 'bad_signature'
  | 'wrong_device'
  | 'revoked'
  | 'activation_window_passed'
  | 'clock_rollback'
  | 'expired';

export type LicenseEvaluation =
  | { status: 'valid'; kind: 'lifetime'; payload: LicensePayload }
  | { status: 'valid'; kind: 'until'; until: Date; payload: LicensePayload }
  | { status: 'invalid'; reason: LicenseInvalidReason };

export interface EvaluateLicenseInput {
  /** License token (without the `PT1.` prefix). */
  token: string;
  /** Ed25519 public key embedded in the app (32 bytes). */
  publicKey: Uint8Array;
  /** Install-time random UUID stored on this device. */
  deviceId: string;
  now: Date;
  /** Latest time the app has seen (stored by the app), or null on first run. */
  lastSeen: Date | null;
  /** 'activation' also enforces `actBy`; later launches ignore it. Default: 'launch'. */
  phase?: 'activation' | 'launch';
  /** True when the last successful server check said the license was revoked. */
  revoked?: boolean;
}

const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/** Offline license check. Pure apart from (deterministic) Web Crypto hashing and signature verification. */
export async function evaluateLicense(input: EvaluateLicenseInput): Promise<LicenseEvaluation> {
  const verified = await verifyLicenseToken(input.token, input.publicKey);
  if (!verified.ok) return { status: 'invalid', reason: verified.reason };
  const payload = verified.payload;

  if ((await deviceFingerprint(input.deviceId)) !== payload.dev) return { status: 'invalid', reason: 'wrong_device' };
  if (input.revoked === true) return { status: 'invalid', reason: 'revoked' };

  const now = toSeconds(input.now);
  if (input.phase === 'activation' && now > payload.actBy) {
    return { status: 'invalid', reason: 'activation_window_passed' };
  }

  if (payload.exp === null) return { status: 'valid', kind: 'lifetime', payload };

  const lastSeen = input.lastSeen === null ? null : toSeconds(input.lastSeen);
  const rolledBackVsLastSeen = lastSeen !== null && lastSeen - now > CLOCK_ROLLBACK_TOLERANCE_SECONDS;
  const rolledBackVsIssue = payload.iat - now > CLOCK_ROLLBACK_TOLERANCE_SECONDS;
  if (rolledBackVsLastSeen || rolledBackVsIssue) return { status: 'invalid', reason: 'clock_rollback' };

  if (now >= payload.exp) return { status: 'invalid', reason: 'expired' };
  return { status: 'valid', kind: 'until', until: new Date(payload.exp * 1000), payload };
}

/** The value the app should store as "last seen" after a launch: never moves backwards. */
export function nextLastSeen(lastSeen: Date | null, now: Date): Date {
  if (lastSeen === null || now.getTime() > lastSeen.getTime()) return new Date(now.getTime());
  return new Date(lastSeen.getTime());
}
