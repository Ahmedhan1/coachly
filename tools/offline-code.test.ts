import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { evaluateLicense } from '../src/domain/license';
import { hexToBytes, unwrapOfflineCode } from '../shared/license';

// Runs the real CLI scripts with the installed Node (22.x strips TypeScript types from shared/license.ts).
const dir = mkdtempSync(join(tmpdir(), 'pt-keys-'));
const keyDir = join(dir, 'keys');
const DEVICE = 'c0ffee00-1234-4abc-8def-001122334455';
const NOW = 1_800_000_000;

function run(script: string, args: string[]): string {
  return execFileSync(process.execPath, [join(import.meta.dirname, script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('offline owner tools (round trip)', () => {
  it('keygen writes a private key (owner-only file) and prints the matching public key', () => {
    const out = run('keygen.mjs', ['--out', keyDir]);
    const publicHex = readFileSync(join(keyDir, 'license-public-key.hex'), 'utf8').trim();
    expect(publicHex).toMatch(/^[0-9a-f]{64}$/);
    expect(out).toContain(publicHex);
    expect(readFileSync(join(keyDir, 'license-private-key.hex'), 'utf8').trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(join(keyDir, 'license-private-key.hex')).mode & 0o077).toBe(0);
  });

  it('keygen refuses to overwrite an existing key', () => {
    expect(() => run('keygen.mjs', ['--out', keyDir])).toThrow();
  });

  it('signs a lifetime PT1 code that the app accepts on that device only', async () => {
    const out = run('sign-offline-code.mjs', [
      '--device', ` ${DEVICE.toUpperCase()} `,
      '--name', 'كابتن أوفلاين',
      '--duration', 'lifetime',
      '--key', join(keyDir, 'license-private-key.hex'),
      '--now', String(NOW),
    ]).trim();
    expect(out.startsWith('PT1.')).toBe(true);
    const token = unwrapOfflineCode(out) ?? '';
    const publicKey = hexToBytes(readFileSync(join(keyDir, 'license-public-key.hex'), 'utf8').trim()) ?? new Uint8Array();

    const ok = await evaluateLicense({ token, publicKey, deviceId: DEVICE, now: new Date(NOW * 1000), lastSeen: null, phase: 'activation' });
    expect(ok).toMatchObject({ status: 'valid', kind: 'lifetime' });
    if (ok.status === 'valid') expect(ok.payload.name).toBe('كابتن أوفلاين');

    const other = await evaluateLicense({ token, publicKey, deviceId: 'another-device-id', now: new Date(NOW * 1000), lastSeen: null });
    expect(other).toEqual({ status: 'invalid', reason: 'wrong_device' });
  });

  it('signs a time-limited code with the requested duration and activation window', async () => {
    const out = run('sign-offline-code.mjs', [
      '--device', DEVICE, '--name', 'x', '--duration', '30', '--window', '3',
      '--key', join(keyDir, 'license-private-key.hex'), '--now', String(NOW),
    ]).trim();
    const token = unwrapOfflineCode(out) ?? '';
    const publicKey = hexToBytes(readFileSync(join(keyDir, 'license-public-key.hex'), 'utf8').trim()) ?? new Uint8Array();
    const result = await evaluateLicense({ token, publicKey, deviceId: DEVICE, now: new Date(NOW * 1000), lastSeen: null, phase: 'activation' });
    expect(result).toMatchObject({ status: 'valid', kind: 'until', until: new Date((NOW + 30 * 86_400) * 1000) });
    const late = await evaluateLicense({ token, publicKey, deviceId: DEVICE, now: new Date((NOW + 4 * 86_400) * 1000), lastSeen: null, phase: 'activation' });
    expect(late).toEqual({ status: 'invalid', reason: 'activation_window_passed' });
  });

  it('rejects bad input with a clear error', () => {
    expect(() => run('sign-offline-code.mjs', ['--name', 'x', '--duration', 'lifetime', '--key', join(keyDir, 'license-private-key.hex')])).toThrow(/device/);
    expect(() => run('sign-offline-code.mjs', ['--device', DEVICE, '--name', 'x', '--duration', 'forever', '--key', join(keyDir, 'license-private-key.hex')])).toThrow(/duration/);
  });
});
