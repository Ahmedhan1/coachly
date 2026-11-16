import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch, searchItems } from './search';

describe('normalizeForSearch', () => {
  it('folds alef, yaa, taa marbuta, diacritics and tatweel', () => {
    expect(normalizeForSearch('أحْمَد')).toBe('احمد');
    expect(normalizeForSearch('إسلام آدم')).toBe('اسلام ادم');
    expect(normalizeForSearch('منى')).toBe('مني');
    expect(normalizeForSearch('سارة')).toBe('ساره');
    expect(normalizeForSearch('كـــريم')).toBe('كريم');
  });
  it('maps Arabic-Indic digits to Western and lower-cases Latin', () => {
    expect(normalizeForSearch('٠١٠٠ ABC')).toBe('0100 abc');
  });
});

describe('matchesQuery', () => {
  it('matches every word in any field', () => {
    expect(matchesQuery(['سارة محمود', '01001234567'], 'ساره 0100')).toBe(true);
    expect(matchesQuery(['سارة محمود'], 'سارة علي')).toBe(false);
  });
  it('empty query matches everything', () => {
    expect(matchesQuery(['x'], '   ')).toBe(true);
  });
  it('searchItems filters a list', () => {
    const items = [{ n: 'أحمد علي' }, { n: 'منى حسن' }];
    expect(searchItems(items, 'احمد', (i) => [i.n])).toEqual([{ n: 'أحمد علي' }]);
  });
});
