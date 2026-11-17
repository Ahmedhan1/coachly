import { describe, expect, it } from 'vitest';
import { MAX_MONEY_MINOR, moneyInputValue, parseMoneyInput } from './moneyInput';

describe('parseMoneyInput', () => {
  it.each([
    ['3000', 300_000],
    ['3,000', 300_000],
    ['٣٠٠٠', 300_000],
    ['2500.5', 250_050],
    ['2500٫25', 250_025],
    [' 1 500 ', 150_000],
  ])('%s → %d', (input, minor) => expect(parseMoneyInput(input)).toBe(minor));
  it('rejects empty, zero, negative and junk', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', '1e5']) expect(parseMoneyInput(bad)).toBeNull();
  });
  it('rejects amounts above the sane ceiling (a slipped finger, not a real price)', () => {
    expect(parseMoneyInput('100000000')).toBe(MAX_MONEY_MINOR);
    for (const huge of ['100000001', '99999999999999999999', '9'.repeat(400)]) expect(parseMoneyInput(huge)).toBeNull();
  });
  it('round-trips to an input value', () => {
    expect(moneyInputValue(300_000)).toBe('3000');
    expect(moneyInputValue(250_050)).toBe('2500.5');
    expect(moneyInputValue(0)).toBe('');
  });
});
