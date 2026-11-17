import { deviceFingerprint, normalizeShortCode, type LicensePayload } from '../../shared/license';
import { json, MAX_API_BODY_BYTES, readLimitedText } from './http';
import type { Deps, LicenseRecord } from './ports';
import { RULES } from './rateLimit';

export type ActivateError = 'invalid' | 'used' | 'expired' | 'rate_limited';

const DAY = 86_400;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

function apiError(error: ActivateError, status: number): Response {
  return json({ error }, status);
}

function parseActivateBody(text: string): { code: string; deviceId: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { code, deviceId } = value as Record<string, unknown>;
  if (typeof code !== 'string' || typeof deviceId !== 'string') return null;
  const normalized = normalizeShortCode(code);
  if (normalized === null || !DEVICE_ID_PATTERN.test(deviceId)) return null;
  return { code: normalized, deviceId };
}

/** Builds the payload for an active record. Deterministic, so a retry from the same device gets the same token. */
function payloadFor(record: LicenseRecord, deviceFp: string, activatedAt: number, expiresAt: number | null): LicensePayload {
  return {
    v: 1,
    lid: record.lid,
    dev: deviceFp,
    name: record.customerName,
    iat: activatedAt,
    actBy: record.actBy,
    exp: expiresAt,
    feat: record.feat,
  };
}

export function expiryOnActivation(record: LicenseRecord, activatedAt: number): number | null {
  if (record.expiresAt !== null) return record.expiresAt;
  return record.durationDays === null ? null : activatedAt + record.durationDays * DAY;
}

export async function handleActivate(request: Request, deps: Deps, clientKey: string): Promise<Response> {
  const now = deps.now();
  if (!(await deps.limiter.hit(RULES.activate, clientKey, now))) return apiError('rate_limited', 429);
  if (!(await deps.limiter.hit(RULES.activateGlobal, 'all', now))) return apiError('rate_limited', 429);

  const text = await readLimitedText(request, MAX_API_BODY_BYTES);
  const body = text === null ? null : parseActivateBody(text);
  if (body === null) return apiError('invalid', 400);

  const record = await deps.store.findByCodeHash(await deps.crypto.hashCode(body.code));
  if (record === null || record.status === 'revoked' || record.status === 'replaced') return apiError('invalid', 404);

  const deviceFp = await deviceFingerprint(body.deviceId);
  let activatedAt: number;
  let expiresAt: number | null;

  if (record.status === 'active') {
    // Same device asking again (e.g. the app was closed before it saved the license): give the same license.
    if (record.deviceFp !== deviceFp || record.activatedAt === null) return apiError('used', 409);
    activatedAt = record.activatedAt;
    expiresAt = record.expiresAt;
    await deps.store.audit('reactivated', record.lid, now);
  } else {
    if (now > record.actBy) return apiError('expired', 410);
    activatedAt = now;
    expiresAt = expiryOnActivation(record, now);
    if (!(await deps.store.markActivated(record.lid, deviceFp, activatedAt, expiresAt))) return apiError('used', 409);
    await deps.store.audit('activated', record.lid, now);
  }

  const license = await deps.crypto.signLicense(payloadFor(record, deviceFp, activatedAt, expiresAt));
  return json({ license, dataKey: deps.config.dataKey });
}

export async function handleStatus(request: Request, deps: Deps, clientKey: string): Promise<Response> {
  const now = deps.now();
  if (!(await deps.limiter.hit(RULES.status, clientKey, now))) return json({ error: 'rate_limited' }, 429);

  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') ?? '');
  const token = match?.[1];
  if (token === undefined) return json({ error: 'invalid' }, 401);
  const verified = await deps.crypto.verifyLicense(token);
  if (!verified.ok) return json({ error: 'invalid' }, 401);

  // Licenses issued with the offline tool are not in D1: they are reported as not revoked.
  const record = await deps.store.findById(verified.payload.lid);
  const revoked = record !== null && (record.status === 'revoked' || record.status === 'replaced');
  return json({ revoked });
}
