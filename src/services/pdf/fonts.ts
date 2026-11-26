/**
 * Fonts for the PDF pages. Page images are rendered from an SVG <foreignObject>, which cannot see the
 * document's fonts, so the woff2 files are also embedded into the page snapshot as @font-face rules with
 * data: URLs (html-to-image `fontEmbedCSS`). The same files are added to `document.fonts` so off-screen
 * measuring uses identical metrics.
 */
export interface PdfFontFile {
  family: string;
  /** File name relative to the base URL. */
  file: string;
  /** CSS font-weight range of the variable font. */
  weight: string;
  unicodeRange: string;
}

const ARABIC_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC';
const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/** Files in public/fonts: Rubik (the app's font, also in src/ui/fonts.css) and Cairo (PDF-only alternative). */
export const PDF_FONT_FILES: readonly PdfFontFile[] = [
  { family: 'Rubik', file: 'rubik-arabic.woff2', weight: '300 900', unicodeRange: ARABIC_RANGE },
  { family: 'Rubik', file: 'rubik-latin.woff2', weight: '300 900', unicodeRange: LATIN_RANGE },
  { family: 'Cairo', file: 'cairo-arabic.woff2', weight: '200 1000', unicodeRange: ARABIC_RANGE },
  { family: 'Cairo', file: 'cairo-latin.woff2', weight: '200 1000', unicodeRange: LATIN_RANGE },
];

export const DEFAULT_FONT_BASE_URL = '/fonts/';

export interface LoadedPdfFonts {
  /** @font-face rules with data: URLs for the page snapshots. */
  embedCss: string;
  families: string[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

const cache = new Map<string, Promise<LoadedPdfFonts>>();

/**
 * Loads the font files for `families` from `baseUrl` (cached per base URL + families), registers them in
 * `document.fonts` and waits for `document.fonts.ready`. A missing file is skipped (system fallback) rather
 * than failing the PDF.
 */
export function loadPdfFonts(
  families: readonly string[],
  baseUrl: string = DEFAULT_FONT_BASE_URL,
  fetchFn: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<LoadedPdfFonts> {
  const key = `${baseUrl}|${[...families].sort().join(',')}`;
  let p = cache.get(key);
  if (!p) {
    p = load(families, baseUrl, fetchFn);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function load(
  families: readonly string[],
  baseUrl: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<LoadedPdfFonts> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const files = PDF_FONT_FILES.filter((f) => families.includes(f.family));
  const rules: string[] = [];
  for (const f of files) {
    try {
      const res = await fetchFn(`${base}${f.file}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      rules.push(
        `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;` +
          `src:url(data:font/woff2;base64,${toBase64(bytes)}) format('woff2');unicode-range:${f.unicodeRange};}`,
      );
      if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
        const face = new FontFace(f.family, bytes.buffer as ArrayBuffer, { weight: f.weight, unicodeRange: f.unicodeRange, display: 'block' });
        await face.load();
        document.fonts.add(face);
      }
    } catch {
      // skip this file; the page falls back to the next font in the stack
    }
  }
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  return { embedCss: rules.join('\n'), families: [...families] };
}
