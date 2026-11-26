import { describe, expect, it } from 'vitest';
import { dataOwnership } from './ownership';

describe('dataOwnership', () => {
  it('the first account on a phone claims its data (also data made before accounts existed)', () => {
    expect(dataOwnership({ owner: null, accountId: 'a', hasData: false })).toBe('claim');
    expect(dataOwnership({ owner: null, accountId: 'a', hasData: true })).toBe('claim');
  });

  it('the same account goes straight in', () => {
    expect(dataOwnership({ owner: 'a', accountId: 'a', hasData: true })).toBe('ok');
  });

  it('another account never sees the previous account data; an empty phone is simply handed over', () => {
    expect(dataOwnership({ owner: 'a', accountId: 'b', hasData: true })).toBe('other_account');
    expect(dataOwnership({ owner: 'a', accountId: 'b', hasData: false })).toBe('claim');
  });
});
