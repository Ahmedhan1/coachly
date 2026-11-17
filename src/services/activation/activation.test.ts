import { describe, expect, it } from 'vitest';
import { formatActivationCodeInput, isCompleteActivationCode } from './codeFormat';
import { FakeActivationService } from './fakeActivationService';

describe('formatActivationCodeInput', () => {
  it.each([
    ['abcd', 'ABCD'],
    ['abcde', 'ABCD-E'],
    ['ab cd-ef gh_jk mn', 'ABCD-EFGH-JKMN'],
    ['ABCD-EFGH-JKMN-PQRS', 'ABCD-EFGH-JKMN'],
    ['أبت', ''],
  ])('%s -> %s', (raw, out) => expect(formatActivationCodeInput(raw)).toBe(out));
  it('detects a complete code', () => {
    expect(isCompleteActivationCode('ABCD-EFGH-JKMN')).toBe(true);
    expect(isCompleteActivationCode('ABCD-EFGH-JKM')).toBe(false);
  });
});

describe('FakeActivationService', () => {
  it('activates a well-formed code and remembers it', async () => {
    const s = new FakeActivationService();
    expect(await s.getState()).toEqual({ status: 'inactive' });
    const r = await s.activate('ABCD-EFGH-JKMN');
    expect(r.ok).toBe(true);
    expect((await s.getState()).status).toBe('active');
  });
  it('rejects malformed codes and simulates used ones', async () => {
    const s = new FakeActivationService();
    expect(await s.activate('ABCD-EFGH')).toEqual({ ok: false, error: 'malformed' });
    expect(await s.activate('ABCD-EFGH-JKM1')).toEqual({ ok: false, error: 'malformed' });
    expect(await s.activate('XXXX-AAAA-BBBB')).toEqual({ ok: false, error: 'used' });
  });
});
