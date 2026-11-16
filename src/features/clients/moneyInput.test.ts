import { describe, expect, it } from 'vitest';
import { moneyInputValue, parseMoneyInput } from './moneyInput';

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
  it('round-trips to an input value', () => {
    expect(moneyInputValue(300_000)).toBe('3000');
    expect(moneyInputValue(250_050)).toBe('2500.5');
    expect(moneyInputValue(0)).toBe('');
  });
});
