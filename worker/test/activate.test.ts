import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { decodeLicenseToken, deviceFingerprint, hexToBytes, verifyLicenseToken } from '../../shared/license';
import { DAY, harness, readJson } from './helpers';
import { TEST_DATA_KEY, TEST_PUBLIC_KEY } from './fixtures';

const DEVICE_A = '3f0b8d4e-1c2a-4e55-9a10-7b6c5d4e3f21';
const DEVICE_B = 'a1b2c3d4-0000-4111-8222-333344445555';
const publicKey = hexToBytes(TEST_PUBLIC_KEY) ?? new Uint8Array();

describe('POST /api/activate', () => {
  it('activates a valid code and returns a license signed for this device plus the data key', async () => {
    const h = await harness();
    const code = await h.issueCode({ name: 'كابتن سارة', duration: 'lifetime' });
    const res = await h.activate(code, DEVICE_A);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.dataKey).toBe(TEST_DATA_KEY);
    const verified = await verifyLicenseToken(String(body.license), publicKey);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload).toMatchObject({
      v: 1,
      dev: await deviceFingerprint(DEVICE_A),
      name: 'كابتن سارة',
      iat: h.clock.now,
      exp: null,
      feat: ['core'],
    });
  });

  it('accepts the code in lower case, with spaces instead of dashes', async () => {
    const h = await harness();
    const code = await h.issueCode();
    const messy = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
    expect((await h.activate(messy, DEVICE_A)).status).toBe(200);
  });

  it('sets the expiry from the activation moment for a time-limited code', async () => {
    const h = await harness();
    const code = await h.issueCode({ duration: '30' });
    h.clock.now += 3 * DAY;
    const body = await readJson(await h.activate(code, DEVICE_A));
    const payload = decodeLicenseToken(String(body.license))?.payload;
    expect(payload?.exp).toBe(h.clock.now + 30 * DAY);
  });

  it('refuses the same code on a second device but re-issues the same license to the first device', async () => {
    const h = await harness();
    const code = await h.issueCode();
    const first = await readJson(await h.activate(code, DEVICE_A));
    const other = await h.activate(code, DEVICE_B);
    expect(other.status).toBe(409);
    expect(await readJson(other)).toEqual({ error: 'used' });
    h.clock.now += 60;
    const again = await readJson(await h.activate(code, DEVICE_A));
    expect(again.license).toBe(first.license);
  });

  it('refuses a code after its activation window', async () => {
    const h = await harness();
    const code = await h.issueCode({ window: '3' });
    h.clock.now += 3 * DAY + 1;
    const res = await h.activate(code, DEVICE_A);
    expect(res.status).toBe(410);
    expect(await readJson(res)).toEqual({ error: 'expired' });
  });

  it('answers invalid for unknown codes and malformed bodies', async () => {
    const h = await harness();
    const unknown = await h.activate('ABCD-EFGH-JKMN', DEVICE_A);
    expect(unknown.status).toBe(404);
    expect(await readJson(unknown)).toEqual({ error: 'invalid' });

    for (const body of ['not json', '{}', JSON.stringify({ code: 'ABCD', deviceId: DEVICE_A }), JSON.stringify({ code: 'ABCDEFGHJKMN', deviceId: 'x' })]) {
      const res = await h.send('/api/activate', { method: 'POST', body });
      expect(res.status).toBe(400);
      expect(await readJson(res)).toEqual({ error: 'invalid' });
    }
  });

  it('rejects oversized bodies', async () => {
    const h = await harness();
    const res = await h.send('/api/activate', { method: 'POST', body: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
  });

  it('rate-limits activation attempts per client', async () => {
    const h = await harness();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await h.activate('ABCD-EFGH-JKMN', DEVICE_A)).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('stores only a hash of the code, and the audit log has no names or device ids', async () => {
    const h = await harness();
    const code = await h.issueCode({ name: 'اسم سري جدا' });
    await h.activate(code, DEVICE_A);
    const plain = code.replaceAll('-', '');
    const row = await env.DB.prepare('SELECT * FROM licenses WHERE customer_name = ?').bind('اسم سري جدا').first<Record<string, unknown>>();
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(plain);
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);

    const audit = await env.DB.prepare('SELECT * FROM audit_log').all<Record<string, unknown>>();
    const dump = JSON.stringify(audit.results);
    expect(dump).not.toContain('اسم سري جدا');
    expect(dump).not.toContain(await deviceFingerprint(DEVICE_A));
    expect(dump).not.toContain(DEVICE_A);
  });
});
