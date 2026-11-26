import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_ITERATIONS, verifyPassword } from '../src/auth/password';

const join = (...parts: string[]) => parts.join('$');

describe('password hashing (PBKDF2-SHA-256, Web Crypto)', () => {
  it('verifies the right password only, with a fresh salt each time', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith(join('pbkdf2-sha256', String(PASSWORD_ITERATIONS), ''))).toBe(true);
    expect(await verifyPassword({ hash: a, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash: a, password: 'correct horse batterY' })).toBe(false);
  });

  it('reads the cost from the stored hash, so it can be raised later', async () => {
    const old = await hashPassword('pw-12345678', 10_000);
    expect(await verifyPassword({ hash: old, password: 'pw-12345678' })).toBe(true);
  });

  it('rejects malformed or foreign hashes instead of throwing', async () => {
    const bad = [
      '',
      join('scrypt', 'abc'),
      join('pbkdf2-sha256', '0', 'AAAA', 'AAAA'),
      join('pbkdf2-sha256', '999999', 'AAAA', 'AAAA'),
      join('pbkdf2-sha256', '1000', '!!', 'AAAA'),
      join('pbkdf2-sha256', '1000', 'AAAA', 'AAAA', 'x'),
    ];
    for (const hash of bad) expect(await verifyPassword({ hash, password: 'x' })).toBe(false);
  });

  it('stays well inside the Free plan CPU budget (10 ms per request)', async () => {
    await hashPassword('warm-up-password');
    const start = Date.now();
    for (let i = 0; i < 10; i++) await hashPassword('correct horse battery');
    // Generous bound for slow machines; measured ~4-5 ms per hash locally.
    expect((Date.now() - start) / 10).toBeLessThan(9);
  });
});
