import { describe, expect, it } from 'vitest';
import { blockHtml, esc } from './pageHtml';

const noImages = () => null;

describe('pageHtml escaping', () => {
  it('escapes text that reaches innerHTML', () => {
    expect(esc(`<img src=x onerror="alert(1)">'`)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;');
    const html = blockHtml({ type: 'paragraph', text: '<script>alert(1)</script>', muted: false }, noImages, '#112233');
    expect(html).not.toContain('<script>');
  });

  it('never puts a non-hex brand color into the chart SVG (restored backups are untrusted)', () => {
    const evil = '"/><img src=x onerror=alert(1)>';
    const html = blockHtml(
      { type: 'weightChart', title: 'الوزن', unit: 'kg', points: [{ date: '2026-01-01', kg: 80 }, { date: '2026-02-01', kg: 78 }] },
      noImages,
      evil,
    );
    expect(html).not.toContain('onerror');
    expect(html).toContain('#2F6F5E');
  });

  it('exercise rows and measurement tables escape every text and keep numbers LTR', () => {
    const row = blockHtml(
      {
        type: 'exercise', index: 3, name: '<b>x</b>', secondaryName: 'Bench <i>', muscles: 'جلوتس، كوادز', sets: '4', reps: '8-10', rest: '90 ث',
        extras: [{ label: 'تمبو', value: '3-1-1' }], notes: '<script>', image: null, muscleMap: null, superset: null, withMap: false, last: true,
      },
      noImages,
      '#112233',
    );
    expect(row).not.toContain('<b>x');
    expect(row).not.toContain('<script>');
    expect(row).toContain('<bdi dir="ltr">4<i>×</i>8-10</bdi>');
    expect(row).toContain('<span>جلوتس</span><span>كوادز</span>');
    const table = blockHtml(
      { type: 'measureTable', head: ['القياس', 'أول', 'آخر', 'التغيير'], rows: [{ label: '<x>', first: '78', latest: '74.5', change: '\u2066-3.5\u2069', unit: 'كجم' }] },
      noImages,
      '#112233',
    );
    expect(table).not.toContain('<x>');
    expect(table).toContain('<td class="ch"><bdi dir="ltr">\u2066-3.5\u2069</bdi></td>');
  });
});
