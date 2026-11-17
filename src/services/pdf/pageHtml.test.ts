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
});
