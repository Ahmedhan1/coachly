// The client page served at GET /c/:shareId: one self-contained Arabic RTL HTML document, inline CSS/JS with a
// per-response nonce, no third-party requests. The key is read from location.hash and never reaches the server.
// Styling follows the app's Pebble tokens (src/ui/tokens.css) and font (Rubik, served from this origin: viewerFonts.ts).
// The 3D muscle model is deferred on this page (see docs/CLOUD.md).
import { escapeHtml } from '../admin/html';
import { VIEWER_SCRIPT } from './viewerScript';
import { VIEWER_FONTS } from './viewerFonts';

const FONT_FACES = VIEWER_FONTS.map(
  (f) => `@font-face{font-family:Rubik;font-style:normal;font-weight:300 900;font-display:swap;src:url(${f.path}) format("woff2");unicode-range:${f.range}}`,
).join('\n');

// Pebble (the app's design, src/ui/tokens.css): Rubik, warm off-white, lifted borderless cards, pill controls,
// a floating pill tab bar at the bottom. --brand* are set from the trainer's colour by the viewer script.
const STYLE = `${FONT_FACES}
:root{color-scheme:light dark;--bg:#F3F1ED;--surface:#FFFFFF;--surface-2:#EFECE6;--line:#E6E2DA;--text:#1C1A17;--text-2:#57524A;--text-3:#6B665D;
--brand:#F25C1F;--brand-on:#111111;--brand-tint:rgba(242,92,31,.12);--danger:#B42318;--ok:#1B7040;
--r-sm:16px;--r-md:22px;--r-lg:28px;--r-control:24px;--r-full:999px;--tap:44px;--nav-h:64px;
--shadow-card:0 1px 2px rgb(40 30 20/.05),0 8px 24px rgb(40 30 20/.06);--shadow-float:0 10px 30px rgb(40 30 20/.14),0 1px 3px rgb(40 30 20/.08);
--font:Rubik,system-ui,-apple-system,"SF Arabic","Segoe UI",Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#131211;--surface:#1E1C1A;--surface-2:#282623;--line:#2F2C29;--text:#F3F0EA;--text-2:#B0AAA0;--text-3:#948E84;--danger:#FF8A7E;--ok:#5CC88A;
--shadow-card:none;--shadow-float:0 10px 30px rgb(0 0 0/.55),inset 0 0 0 1px #2F2C29}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0;min-block-size:100dvh;background:var(--bg);color:var(--text);font:400 16px/1.55 var(--font);font-variant-numeric:lining-nums tabular-nums}
button,input,textarea{font-family:var(--font)}
.num{font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
#brand{padding:max(16px,env(safe-area-inset-top)) 16px 4px}
#brand:empty{display:none}
.hero{max-inline-size:640px;margin:0 auto}
.hero-top{display:flex;align-items:center;gap:12px;min-block-size:48px}
.logo{inline-size:48px;block-size:48px;object-fit:contain;border-radius:var(--r-sm);background:#fff;padding:3px;flex:none;box-shadow:var(--shadow-card)}
.trainer-photo{inline-size:48px;block-size:48px;border-radius:50%;object-fit:cover;flex:none;box-shadow:var(--shadow-card)}
.brand-id{display:flex;flex-direction:column;min-inline-size:0}
.brand-name{font:600 16px/1.3 var(--font)}
.hero .sub{margin:0;font-size:13px;color:var(--text-3)}
.hello{font:700 30px/1.25 var(--font);margin:20px 0 0}
main{max-inline-size:640px;margin:0 auto;padding:0 16px calc(var(--nav-h) + max(12px,env(safe-area-inset-bottom)) + 32px)}
h2{font:600 20px/1.35 var(--font);margin:24px 0 8px}
h3{font:600 17px/1.35 var(--font);margin:0 0 8px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.sub{color:var(--text-2);font-size:14px;margin:4px 0 0}.pre{white-space:pre-wrap;margin:0}
.card{background:var(--surface);border-radius:var(--r-md);padding:18px;margin-block:12px;box-shadow:var(--shadow-card)}
.msg{margin-block-start:28px}.msg p{margin:0 0 12px}
/* Next session: the one brand block on the page (like the app's Home). */
.next{margin-block:16px 12px;padding:18px 20px;border-radius:var(--r-lg);background:var(--brand);color:var(--brand-on)}
.next-label{display:flex;align-items:center;gap:6px;font:500 13px var(--font);opacity:.9}
.next-label::before{content:"";inline-size:8px;block-size:8px;border-radius:50%;background:currentColor}
.next-day{display:block;font:700 30px/1.2 var(--font);margin-block-start:8px}
.next-time{display:block;font:500 16px var(--font);margin-block-start:2px;opacity:.9}
/* Everything else at a glance: one lifted card, one row per fact. */
.facts{padding:4px 18px}
.fact{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-block:14px;border-block-start:1px solid var(--line)}
.fact:first-child{border-block-start:0}
.fact-label{color:var(--text-2);font-size:14px;flex:none}
.fact-main{display:flex;flex-direction:column;align-items:flex-end;text-align:end;min-inline-size:0;gap:2px}
.fact-value{font:600 16px/1.35 var(--font);overflow-wrap:anywhere}
.fact-sub{font-size:13px;color:var(--text-3)}
.meter{inline-size:120px;block-size:8px;border-radius:var(--r-full);background:var(--surface-2);overflow:hidden;margin-block-start:4px}
.meter>span{display:block;block-size:100%;border-radius:inherit;background:var(--brand)}
/* Floating pill tab bar, thumb zone. */
.tabs{position:fixed;z-index:5;inset-inline:16px;inset-block-end:max(12px,env(safe-area-inset-bottom));max-inline-size:608px;margin-inline:auto;
display:flex;gap:2px;padding:6px;block-size:var(--nav-h);background:var(--surface);border-radius:var(--r-full);box-shadow:var(--shadow-float)}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-inline-size:0;border:0;border-radius:var(--r-full);
background:transparent;color:var(--text-3);font:500 11px/1.2 var(--font);padding:0 4px;white-space:nowrap}
.tab svg{inline-size:24px;block-size:24px;fill:currentColor}
.tab[aria-selected="true"]{background:var(--brand-tint);color:var(--text)}
.tab[aria-selected="true"] svg{fill:var(--brand)}
.pills{display:flex;gap:8px;overflow-x:auto;padding-block:8px;scrollbar-width:none;margin-inline:-16px;padding-inline:16px}
.pills::-webkit-scrollbar{display:none}
.pill{flex:none;min-block-size:40px;border:0;background:var(--surface);color:var(--text);border-radius:var(--r-full);padding:0 18px;font:500 14px var(--font);box-shadow:var(--shadow-card)}
.pill[aria-pressed="true"]{background:var(--text);color:var(--bg)}
.pill .dot{display:inline-block;inline-size:8px;block-size:8px;border-radius:50%;background:var(--brand);margin-inline-start:6px;vertical-align:middle}
.day-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:16px 0 4px}
.day-head h2{margin:0}
.list,.items{list-style:none;margin:0;padding:0}
.ex{background:var(--surface);border-radius:var(--r-lg);margin-block:14px;overflow:hidden;box-shadow:var(--shadow-card)}
.ex-media{display:flex;gap:4px;padding:6px 6px 0;block-size:180px}
.ex-media img{flex:1;min-inline-size:0;inline-size:100%;block-size:100%;object-fit:cover;border-radius:calc(var(--r-lg) - 6px);background:var(--surface-2)}
.ex-body{padding:14px 18px 18px}
.ex-top{display:flex;align-items:center;gap:10px}
.ex-n{flex:none;inline-size:28px;block-size:28px;border-radius:50%;background:var(--brand-tint);color:var(--text);font:600 14px/28px var(--font);text-align:center}
.ex-name{font:600 17px/1.4 var(--font)}
.ex-main{font:700 20px/1.3 var(--font);margin-block-start:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-block-start:10px}
.chip{font-size:13px;padding:4px 12px;border-radius:var(--r-full);background:var(--surface-2)}
.chip.brand{background:var(--brand-tint);font-weight:600}
.items li{padding-block:10px;border-block-start:1px solid var(--line);display:flex;gap:10px}.items li:first-child{border-block-start:0}
.items li::before{content:"";flex:none;inline-size:6px;block-size:6px;border-radius:50%;background:var(--brand);margin-block-start:10px}
.time{font-weight:500;color:var(--text-2);font-size:14px}
.supp{padding-block:10px;border-block-start:1px solid var(--line)}.supp:nth-of-type(1){border-block-start:0}
.kcal{font:700 44px/1 var(--font);margin:6px 0}
.macros{display:grid;gap:12px;margin-block-start:14px}
.macro-row{display:flex;justify-content:space-between;font-size:14px;margin-block-end:6px}
.bar{block-size:8px;border-radius:var(--r-full);background:var(--surface-2);overflow:hidden}
.bar>span{display:block;block-size:100%;inline-size:0;border-radius:inherit;background:var(--brand)}
.big{font:700 34px/1.1 var(--font)}.unit{font-size:15px;font-weight:500;color:var(--text-2);margin-inline-start:4px}
.delta{display:inline-block;margin-block-start:8px;font-size:14px;font-weight:500;padding:3px 12px;border-radius:var(--r-full);background:var(--surface-2)}
.chart{display:block;inline-size:100%;block-size:auto;margin-block-start:12px;overflow:visible}
.chart text{direction:ltr}.chart .axis{fill:var(--text-3);font:12px var(--font)}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .line{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.chart .area{fill:var(--brand);opacity:.12}
.chart .dot{fill:var(--surface);stroke:var(--brand);stroke-width:2.5}
.rec{display:flex;justify-content:space-between;gap:8px;padding-block:10px;border-block-start:1px solid var(--line)}.rec:first-of-type{border-block-start:0}
.next-flag{display:inline-flex;align-items:center;gap:6px;margin:12px 0 0;padding:6px 14px;border-radius:var(--r-full);background:var(--brand);color:var(--brand-on);font-weight:600;font-size:14px}
.badges{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.badge{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--r-full);background:var(--brand-tint);font-weight:600;font-size:14px}
.badge.done::before{content:"";inline-size:8px;block-size:8px;border-radius:50%;background:var(--brand);flex:none}
.hist{color:var(--text-2)}.hist strong{color:var(--text)}
.week{margin-block-start:18px;padding-block-start:14px;border-block-start:1px solid var(--line)}
fieldset.energy{border:0;margin:0 0 12px;padding:0;min-inline-size:0}
.seg{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.seg-opt{position:relative;display:block}
.seg-opt input{position:absolute;opacity:0;inline-size:100%;block-size:100%;margin:0;min-block-size:0;cursor:pointer}
.seg-face{display:flex;flex-direction:column;align-items:center;justify-content:center;min-block-size:60px;border-radius:var(--r-sm);background:var(--surface-2);padding:4px 2px;text-align:center}
.seg-n{font-weight:700;font-size:18px}.seg-l{font-size:11px;color:var(--text-2);line-height:1.2}
.seg-opt input:checked+.seg-face{background:var(--brand);color:var(--brand-on)}
.seg-opt input:checked+.seg-face .seg-l{color:inherit}
.seg-opt input:focus-visible+.seg-face{outline:3px solid var(--brand);outline-offset:2px}
.empty{text-align:center;color:var(--text-2);padding:24px 16px}
.field{display:block;margin-block:12px}.label{display:block;font:500 13px var(--font);margin-block-end:6px;color:var(--text-2)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row2 .field{margin-block:0}
input,textarea{inline-size:100%;min-block-size:48px;font:16px var(--font);color:var(--text);background:var(--surface-2);border:0;border-radius:var(--r-control);padding:12px 16px}
textarea{border-radius:var(--r-sm);resize:vertical}
input[type=file]{padding:10px 0;background:transparent;border:0}
details{margin-block:12px;border-radius:var(--r-sm);background:var(--surface-2);padding:0 16px}
details .row2 input{background:var(--surface)}
summary{min-block-size:var(--tap);display:flex;align-items:center;font-weight:500;cursor:pointer}
details[open]{padding-block-end:14px}
.thumbs{display:flex;gap:10px;flex-wrap:wrap;margin-block-end:8px}.thumbs:empty{display:none}
.thumb{position:relative;inline-size:88px;block-size:88px}.thumb img{inline-size:100%;block-size:100%;object-fit:cover;border-radius:var(--r-sm);background:var(--surface-2)}
.thumb-x{position:absolute;inset-block-start:-8px;inset-inline-end:-8px;inline-size:32px;block-size:32px;border-radius:50%;border:2px solid var(--surface);background:var(--text);color:var(--surface);font:600 16px/1 var(--font);padding:0}
.thumb-x::after{content:"";position:absolute;inset:-6px}
.add-photo,.pick-photo{display:flex;align-items:center;justify-content:center;gap:8px;min-block-size:48px;border-radius:var(--r-control);background:var(--surface-2);color:var(--text);font:500 16px var(--font);cursor:pointer}
.add-photo::before,.pick-photo::before{content:"+";display:grid;place-items:center;inline-size:24px;block-size:24px;border-radius:50%;background:var(--brand);color:var(--brand-on);font:600 18px/1 var(--font)}
.add-photo input,.pick-photo input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}
.my-photo{margin-block-start:12px}.my-photo-row{display:flex;align-items:center;gap:12px}.my-photo-row .pick-photo{flex:1}
.my-photo-face{inline-size:64px;block-size:64px;border-radius:50%;overflow:hidden;flex:none;background:var(--surface-2)}
.my-photo-face img{inline-size:100%;block-size:100%;object-fit:cover}
.add-photo:focus-within,.pick-photo:focus-within{outline:3px solid var(--brand);outline-offset:2px}.add-photo[hidden]{display:none}
.btn{min-block-size:52px;inline-size:100%;border:0;border-radius:var(--r-full);background:var(--brand);color:var(--brand-on);font:600 17px var(--font);padding:0 20px}
.btn:disabled{opacity:.6}.status{min-block-size:1.5em;margin:12px 0 0;font-weight:500}
.status.ok{color:var(--ok)}.status.err{color:var(--danger)}
.foot{text-align:center;color:var(--text-3);font-size:13px;margin-block-start:28px}
button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
`;

export interface ViewerPageInput {
  nonce: string;
  shareId: string;
  /** e.g. "https://pt-coach.pages.dev/exercise-pack/img/" or "" when no app origin is configured. */
  imageBase: string;
}

export function viewerHtml(input: ViewerPageInput): string {
  const nonce = escapeHtml(input.nonce);
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>صفحتك</title><style nonce="${nonce}">${STYLE}</style></head>
<body><header id="brand"></header>
<main id="app"><div class="card msg"><p>جاري التحميل…</p></div></main>
<div id="cfg" hidden data-share="${escapeHtml(input.shareId)}" data-img="${escapeHtml(input.imageBase)}"></div>
<noscript><p>الصفحة دي محتاجة JavaScript.</p></noscript>
<script nonce="${nonce}">${VIEWER_SCRIPT}</script>
</body></html>`;
}

/** Strict CSP: only this response's inline script/style, same-origin fetches and fonts, images from self/data/blob/app. */
export function viewerHeaders(nonce: string, imageOrigin: string | null): Record<string, string> {
  const img = ["'self'", 'data:', 'blob:', ...(imageOrigin === null ? [] : [imageOrigin])].join(' ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      `img-src ${img}`,
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

/** The page's font file for `path` (/c/_/rubik-*.<hash>.woff2), or null. Immutable: the hash changes with the file. */
export function viewerFont(path: string): Response | null {
  const font = VIEWER_FONTS.find((f) => f.path === path);
  if (!font) return null;
  const bytes = Uint8Array.from(atob(font.base64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'font/woff2',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
