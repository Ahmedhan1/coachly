import { describe, expect, it } from 'vitest';
import { filterPrepared, matchesQuery, normalizeForSearch, prepareSearch, searchItems } from './search';

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

describe('prepared search (normalise once, filter per keystroke)', () => {
  const items = [{ n: 'أحمد علي', p: '0111' }, { n: 'منى حسن 💪', p: '0155' }, { n: 'سارة', p: '' }];
  const index = prepareSearch(items, (i) => [i.n, i.p]);
  it('gives the same results as searchItems', () => {
    for (const q of ['', 'احمد', '0155', 'مني', '💪', 'سارة علي', 'xyz']) {
      expect(filterPrepared(index, q)).toEqual(searchItems(items, q, (i) => [i.n, i.p]));
    }
  });
  it('keeps the original order and handles 500 rows quickly', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ n: `عميل ${i}`, p: `010${i}` }));
    const big = prepareSearch(many, (i) => [i.n, i.p]);
    const started = performance.now();
    for (let k = 0; k < 50; k++) filterPrepared(big, 'عميل 37');
    expect((performance.now() - started) / 50).toBeLessThan(5);
    expect(filterPrepared(big, '0103').map((i) => i.n).slice(0, 2)).toEqual(['عميل 3', 'عميل 30']);
  });
});
