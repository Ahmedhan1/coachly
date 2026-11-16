/**
 * License format shared by the app, the Cloudflare Worker and the offline owner tools.
 * Contract: see "License contract" in CLAUDE.md.
 *
 * Dependency-light on purpose: only @noble/ed25519 (async API, SHA-512 via Web Crypto) and
 * globalThis.crypto, so the same file runs in Safari, Cloudflare Workers and Node 22.
 */
import { getPublicKeyAsync, Point, signAsync, utils, verifyAsync } from '@noble/ed25519';

// ---------- types ----------

export interface LicensePayload {
  v: 1;
  /** License id. */
  lid: string;
  /** First 32 hex chars of SHA-256(deviceId). */
  dev: string;
  /** Customer (trainer) name. */
  name: string;
  /** Issued at, unix seconds. */
  iat: number;
  /** Last moment the license may be activated, unix seconds. */
  actBy: number;
  /** Expiry in unix seconds, or null for a lifetime license. */
  exp: number | null;
  /** Enabled features. */
  feat: string[];
}

export type VerifyResult =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' };

export interface DecodedToken {
  payload: LicensePayload;
  payloadBytes: Uint8Array;
  signature: Uint8Array;
}

export const LICENSE_VERSION = 1;
export const SIGNATURE_LENGTH = 64;
export const KEY_LENGTH = 32;
export const FINGERPRINT_HEX_LENGTH = 32;
const MAX_TOKEN_LENGTH = 4096;
const MAX_TEXT_LENGTH = 200;

// ---------- byte helpers ----------

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_INDEX: ReadonlyMap<string, number> = new Map([...B64URL].map((c, i) => [c, i]));

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63) + B64URL.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63);
  }
  return out;
}

/** Strict decoder: no padding, base64url alphabet only, canonical encoding only. Returns null on error. */
export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 4 === 1) return null;
  const values: number[] = [];
  for (const ch of text) {
    const v = B64URL_INDEX.get(ch);
    if (v === undefined) return null;
    values.push(v);
  }
  const out = new Uint8Array(Math.floor((values.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const v of values) {
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >>> bits) & 255;
    }
  }
  // Leftover bits must be zero, otherwise two strings would decode to the same bytes.
  if ((buffer & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer-backed view: Web Crypto typings reject SharedArrayBuffer-backed input.
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}

// ---------- payload validation (hand-written, no zod) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isShortText(value: unknown, minLength: number): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= MAX_TEXT_LENGTH;
}

/** Returns a clean copy of a valid payload (unknown keys dropped), or null. */
export function parseLicensePayload(value: unknown): LicensePayload | null {
  if (!isRecord(value)) return null;
  const { v, lid, dev, name, iat, actBy, exp, feat } = value;
  if (v !== LICENSE_VERSION) return null;
  if (!isShortText(lid, 1)) return null;
  if (typeof dev !== 'string' || !/^[0-9a-f]{32}$/.test(dev)) return null;
  if (!isShortText(name, 0)) return null;
  if (!isUnixSeconds(iat) || !isUnixSeconds(actBy)) return null;
  if (exp !== null && !isUnixSeconds(exp)) return null;
  if (!Array.isArray(feat) || feat.length > 32) return null;
  const features: string[] = [];
  for (const f of feat) {
    if (!isShortText(f, 1)) return null;
    features.push(f);
  }
  return { v: LICENSE_VERSION, lid, dev, name, iat, actBy, exp, feat: features };
}

// ---------- token ----------

function encodePayload(payload: LicensePayload): Uint8Array {
  // Fixed key order so the same payload always produces the same bytes.
  const ordered: LicensePayload = {
    v: payload.v,
    lid: payload.lid,
    dev: payload.dev,
    name: payload.name,
    iat: payload.iat,
    actBy: payload.actBy,
    exp: payload.exp,
    feat: [...payload.feat],
  };
  return new TextEncoder().encode(JSON.stringify(ordered));
}

/** Creates `b64url(utf8(JSON payload)) + "." + b64url(ed25519 signature over the payload bytes)`. */
export async function signLicense(payload: LicensePayload, privateKey: Uint8Array): Promise<string> {
  if (parseLicensePayload(payload) === null) throw new Error('invalid license payload');
  if (privateKey.length !== KEY_LENGTH) throw new Error('private key must be 32 bytes');
  const bytes = encodePayload(payload);
  const signature = await signAsync(bytes, privateKey);
  return `${base64UrlEncode(bytes)}.${base64UrlEncode(signature)}`;
}

/** Splits and parses a token WITHOUT checking the signature. Returns null when malformed. */
export function decodeLicenseToken(token: string): DecodedToken | null {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payloadBytes = base64UrlDecode(parts[0] ?? '');
  const signature = base64UrlDecode(parts[1] ?? '');
  if (payloadBytes === null || signature === null || signature.length !== SIGNATURE_LENGTH) return null;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payloadBytes));
  } catch {
    return null;
  }
  const payload = parseLicensePayload(json);
  if (payload === null) return null;
  return { payload, payloadBytes, signature };
}

/** Full offline check of the signature. Does not look at dates or the device: see src/domain/license. */
export async function verifyLicenseToken(token: string, publicKey: Uint8Array): Promise<VerifyResult> {
  const decoded = decodeLicenseToken(token);
  if (decoded === null) return { ok: false, reason: 'malformed' };
  let valid: boolean;
  try {
    // zip215: false = strict RFC 8032 checks (rejects non-canonical encodings).
    valid = await verifyAsync(decoded.signature, decoded.payloadBytes, publicKey, { zip215: false });
  } catch {
    valid = false;
  }
  return valid ? { ok: true, payload: decoded.payload } : { ok: false, reason: 'bad_signature' };
}

/**
 * Builds noble's base-point multiplication table (synchronous, ~25-30 ms once per process/isolate).
 * The Worker calls this in global scope so the first signing request stays inside the CPU budget.
 */
export function precomputeSigningTables(): void {
  Point.BASE.multiply(3n);
}

export async function publicKeyFromPrivate(privateKey: Uint8Array): Promise<Uint8Array> {
  return getPublicKeyAsync(privateKey);
}

export async function generateKeyPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  const privateKey = utils.randomSecretKey();
  return { privateKey, publicKey: await getPublicKeyAsync(privateKey) };
}

// ---------- short activation code ----------

export const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const SHORT_CODE_LENGTH = 12;

/** 12 random chars from the alphabet, unformatted. Uses rejection sampling so every char is equally likely. */
export function generateShortCode(random: (length: number) => Uint8Array = randomBytes): string {
  const n = SHORT_CODE_ALPHABET.length;
  const limit = 256 - (256 % n); // 240: largest multiple of 30 below 256
  let code = '';
  while (code.length < SHORT_CODE_LENGTH) {
    for (const b of random(SHORT_CODE_LENGTH * 2)) {
      if (b >= limit) continue;
      code += SHORT_CODE_ALPHABET.charAt(b % n);
      if (code.length === SHORT_CODE_LENGTH) break;
    }
  }
  return code;
}

/** `ABCDEFGHJKMN` -> `ABCD-EFGH-JKMN`. */
export function formatShortCode(code: string): string {
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12)].join('-');
}

/** Upper-cases, drops spaces and dashes, maps Arabic-Indic digits. Returns null unless 12 alphabet chars remain. */
export function normalizeShortCode(input: string): string | null {
  const cleaned = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-‐-―−_]/g, '')
    .toUpperCase();
  if (cleaned.length !== SHORT_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!SHORT_CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

// ---------- device ----------

/** Device ids are lower-case UUIDs; trimming/lower-casing makes ids copied by hand (offline tool) match. */
export function normalizeDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

/** First 32 hex chars of SHA-256(normalised deviceId). */
export async function deviceFingerprint(deviceId: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(normalizeDeviceId(deviceId)));
  return bytesToHex(digest).slice(0, FINGERPRINT_HEX_LENGTH);
}

// ---------- offline long code ----------

export const OFFLINE_CODE_PREFIX = 'PT1.';

export function wrapOfflineCode(token: string): string {
  return OFFLINE_CODE_PREFIX + token;
}

/** Accepts text pasted from WhatsApp etc. (stray spaces/newlines). Returns the bare token or null. */
export function unwrapOfflineCode(input: string): string | null {
  const compact = input.replace(/\s+/g, '');
  if (!compact.startsWith(OFFLINE_CODE_PREFIX)) return null;
  const token = compact.slice(OFFLINE_CODE_PREFIX.length);
  return token.length > 0 ? token : null;
}
