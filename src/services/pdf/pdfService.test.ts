import { describe, expect, it } from 'vitest';
import { layoutPdfDocument } from '@/domain/pdf';
import { pdfTestCase, syntheticExercises } from '@/domain/pdf/fixtures';
import { FakePdfRenderer } from './fakePdfRenderer';
import { collectImageRefs, createImageSource, imageRefKey } from './images';
import { bdi, blockHtml, esc, pageHtml } from './pageHtml';

describe('page HTML', () => {
  it('escapes all text', () => {
    expect(esc(`<img src=x onerror="a">&'`)).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    const html = blockHtml({ type: 'paragraph', text: '<script>alert(1)</script>', muted: false }, () => null, '#000000');
    expect(html).not.toContain('<script>');
  });

  it('builds RTL pages with footer disclaimer, page number and only safe image URLs', () => {
    const input = pdfTestCase('max_branding', syntheticExercises(12, true));
    const doc = layoutPdfDocument(input);
    const urlOf = (ref: unknown) => (ref ? 'javascript:alert(1)' : null);
    const cover = pageHtml(doc, doc.pages[0]!, urlOf, input.title);
    expect(cover).toContain('dir="rtl"');
    expect(cover).toContain('لا يغني عن استشارة طبيب');
    expect(cover).not.toContain('javascript:');
    const content = pageHtml(doc, doc.pages[1]!, () => 'blob:http://x/1', input.title);
    expect(content).toContain(`2 / ${doc.pages.length}`);
    expect(content).toContain('class="ptpdf-bg"');
    expect(content).toContain('opacity:1');
  });

  it('numbers without Arabic letters are forced LTR so signs and % stay in place ("-20%", "31%")', () => {
    expect(bdi('31%')).toBe('<bdi dir="ltr">31%</bdi>');
    expect(bdi('\u2066-20%\u2069')).toBe('<bdi dir="ltr">\u2066-20%\u2069</bdi>');
    expect(bdi('× 1.55')).toBe('<bdi dir="ltr">× 1.55</bdi>');
    expect(bdi('1,800 سعرة')).toBe('<bdi>1,800 سعرة</bdi>');
    const kv = blockHtml({ type: 'keyValues', rows: [{ label: 'نسبة الدهون', value: '31%' }] }, () => null, '#000000');
    expect(kv).toContain('<bdi dir="ltr">31%</bdi>');
  });

  it('chart draws earliest point on the right (RTL)', () => {
    const html = blockHtml({ type: 'weightChart', title: 'الوزن', unit: 'كجم', points: [{ date: '2026-06-01', kg: 78 }, { date: '2026-07-01', kg: 76 }] }, () => null, '#112233');
    const xs = [...html.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs[0]!).toBeGreaterThan(xs[1]!);
  });
});

describe('images', () => {
  it('collects distinct refs from blocks and branding', () => {
    const input = pdfTestCase('fifty_exercises', syntheticExercises(50, true));
    const refs = collectImageRefs([input.branding.logo, input.branding.logo, { a: [{ kind: 'url', url: 'm.png' }] }]);
    expect(refs.map(imageRefKey)).toEqual(['s:fixture-logo', 'u:m.png']);
  });

  it('image source resolves each kind and fails quietly', async () => {
    const fetched: string[] = [];
    const src = createImageSource({
      getStoredBlob: async (id) => (id === 'a' ? new Blob(['x']) : undefined),
      fetchFn: async (u) => {
        fetched.push(u);
        return u.includes('bad') ? new Response(null, { status: 404 }) : new Response('img');
      },
      packBaseUrl: '/exercise-pack/img/',
    });
    expect(await src.load({ kind: 'stored', imageId: 'a' })).toBeInstanceOf(Blob);
    expect(await src.load({ kind: 'stored', imageId: 'b' })).toBeNull();
    expect(await src.load({ kind: 'pack', path: 'X-0.webp' })).toBeInstanceOf(Blob);
    expect(await src.load({ kind: 'url', url: '/bad.png' })).toBeNull();
    expect(fetched).toEqual(['/exercise-pack/img/X-0.webp', '/bad.png']);
  });
});

describe('FakePdfRenderer', () => {
  it('returns a PDF with the laid-out page count', async () => {
    const r = new FakePdfRenderer();
    const res = await r.render(pdfTestCase('no_images', syntheticExercises(6, false)));
    expect(res.ok && res.value.pageCount).toBeGreaterThan(1);
  });
});
