// The client page served at GET /c/:shareId: one self-contained Arabic RTL HTML document, inline CSS/JS with a
// per-response nonce, no third-party requests. The key is read from location.hash and never reaches the server.
// Styling follows design direction B (design/direction-b/tokens.css) with system fonts (no font downloads).
// The 3D muscle model is deferred on this page (see docs/CLOUD.md).
import { escapeHtml } from '../admin/html';
import { VIEWER_SCRIPT } from './viewerScript';

const STYLE = `
:root{color-scheme:light dark;--bg:#EDEDEA;--surface:#FFFFFF;--surface-2:#F3F3F1;--line:#E3E3DF;--text:#0E0F0F;--text-2:#4A4D4E;--text-3:#5F6364;
--brand:#F25C1F;--brand-on:#111111;--brand-tint:rgba(242,92,31,.12);--danger:#B42318;--ok:#1B7040;--r-sm:10px;--r-md:14px;--r-lg:18px;--r-full:999px;--tap:44px;
--font:system-ui,-apple-system,"SF Arabic","Segoe UI",Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0B0C0C;--surface:#161818;--surface-2:#1F2222;--line:#252828;--text:#F2F3F1;--text-2:#A3A8A6;--text-3:#8E9391;--danger:#FF8A7E;--ok:#5CC88A}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.55 var(--font);font-variant-numeric:lining-nums tabular-nums}
.num{font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
#brand{background:var(--brand);color:var(--brand-on);padding:12px 16px 28px;padding-block-start:max(16px,env(safe-area-inset-top))}
#brand:empty{min-block-size:56px;padding:0}
.hero{max-inline-size:640px;margin:0 auto}
.hero-top{display:flex;align-items:center;gap:12px;min-block-size:48px}
.logo{inline-size:64px;block-size:64px;object-fit:contain;border-radius:16px;background:#fff;padding:4px;flex:none;box-shadow:0 1px 0 rgba(0,0,0,.08)}
.brand-name{font-weight:700;font-size:17px;line-height:1.3}
.hello{font:800 28px/1.2 var(--font);margin:16px 0 4px}
.hero .sub{color:inherit;opacity:.85}
main{max-inline-size:640px;margin:-16px auto 0;padding:0 16px;padding-block-end:max(32px,env(safe-area-inset-bottom))}
h2{font:700 20px/1.3 var(--font);margin:20px 0 8px}
h3{font:700 17px/1.35 var(--font);margin:0 0 8px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.sub{color:var(--text-2);font-size:14px;margin:4px 0 0}.pre{white-space:pre-wrap;margin:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px;margin-block:12px}
.msg{margin-block-start:28px}.msg p{margin:0 0 12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-block:0 4px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px 14px;min-inline-size:0}
.stat-label{display:block;font:600 13px var(--font);color:var(--text-2)}
.stat-value{display:block;font:800 19px/1.3 var(--font);margin-block-start:4px;overflow-wrap:anywhere}
.stat-sub{display:block;font-size:13px;color:var(--text-2);margin-block-start:2px}
.stat.accent{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
.tabs{position:sticky;top:0;z-index:2;display:flex;gap:4px;padding:4px;margin-block:16px 4px;background:var(--surface-2);border-radius:var(--r-full);border:1px solid var(--line);
box-shadow:0 6px 12px -10px rgba(0,0,0,.4)}
.tab{flex:1;min-block-size:var(--tap);border:0;border-radius:var(--r-full);background:transparent;color:var(--text);font:600 15px var(--font);padding:0 6px;white-space:nowrap}
.tab[aria-selected="true"]{background:var(--brand);color:var(--brand-on)}
.pills{display:flex;gap:8px;overflow-x:auto;padding-block:8px;scrollbar-width:none;margin-inline:-16px;padding-inline:16px}
.pills::-webkit-scrollbar{display:none}
.pill{flex:none;min-block-size:40px;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:var(--r-full);padding:0 16px;font:600 14px var(--font)}
.pill[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}
.pill .dot{display:inline-block;inline-size:8px;block-size:8px;border-radius:50%;background:var(--brand);margin-inline-start:6px;vertical-align:middle}
.day-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:12px 0 4px}
.day-head h2{margin:0}
.list,.items{list-style:none;margin:0;padding:0}
.ex{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);margin-block:12px;overflow:hidden}
.ex-media{display:flex;gap:2px;background:var(--surface-2);block-size:168px}
.ex-media img{flex:1;min-inline-size:0;inline-size:100%;block-size:100%;object-fit:cover;background:#fff}
.ex-body{padding:12px 16px 16px}
.ex-top{display:flex;align-items:flex-start;gap:10px}
.ex-n{flex:none;inline-size:28px;block-size:28px;border-radius:50%;background:var(--brand);color:var(--brand-on);font:700 14px/28px var(--font);text-align:center}
.ex-name{font-weight:700;font-size:17px;line-height:1.4}
.ex-main{font:800 18px/1.3 var(--font);margin-block-start:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-block-start:8px}
.chip{font-size:13px;padding:3px 10px;border-radius:var(--r-full);background:var(--surface-2);border:1px solid var(--line)}
.chip.brand{background:var(--brand-tint);border-color:transparent;font-weight:600}
.items li{padding-block:8px;border-block-start:1px solid var(--line);display:flex;gap:8px}.items li:first-child{border-block-start:0}
.items li::before{content:"";flex:none;inline-size:6px;block-size:6px;border-radius:50%;background:var(--brand);margin-block-start:10px}
.time{font-weight:600;color:var(--text-2);font-size:14px}
.supp{padding-block:8px;border-block-start:1px solid var(--line)}.supp:nth-of-type(1){border-block-start:0}
.kcal{font:800 40px/1 var(--font);margin:4px 0}
.macros{display:grid;gap:10px;margin-block-start:12px}
.macro-row{display:flex;justify-content:space-between;font-size:14px;margin-block-end:4px}
.bar{block-size:8px;border-radius:var(--r-full);background:var(--surface-2);overflow:hidden}
.bar>span{display:block;block-size:100%;inline-size:0;border-radius:inherit;background:var(--brand)}
.big{font:800 32px/1.1 var(--font)}.unit{font-size:15px;font-weight:600;color:var(--text-2);margin-inline-start:4px}
.delta{display:inline-block;margin-block-start:6px;font-size:14px;font-weight:600;padding:2px 10px;border-radius:var(--r-full);background:var(--surface-2)}
.chart{display:block;inline-size:100%;block-size:auto;margin-block-start:12px;overflow:visible}
.chart text{direction:ltr}.chart .axis{fill:var(--text-3);font:12px var(--font)}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .line{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.chart .area{fill:var(--brand);opacity:.12}
.chart .dot{fill:var(--surface);stroke:var(--brand);stroke-width:2.5}
.rec{display:flex;justify-content:space-between;gap:8px;padding-block:8px;border-block-start:1px solid var(--line)}.rec:first-of-type{border-block-start:0}
.next-flag{display:inline-block;margin:12px 0 0;padding:4px 12px;border-radius:var(--r-full);background:var(--brand);color:var(--brand-on);font-weight:700;font-size:14px}
.badges{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.badge{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r-full);background:var(--brand-tint);font-weight:700;font-size:14px}
.badge.done::before{content:"";inline-size:8px;block-size:8px;border-radius:50%;background:var(--brand);flex:none}
.hist{color:var(--text-2)}.hist strong{color:var(--text)}
.week{margin-block-start:16px;padding-block-start:12px;border-block-start:1px solid var(--line)}
fieldset.energy{border:0;margin:0 0 12px;padding:0;min-inline-size:0}
.seg{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.seg-opt{position:relative;display:block}
.seg-opt input{position:absolute;opacity:0;inline-size:100%;block-size:100%;margin:0;min-block-size:0;cursor:pointer}
.seg-face{display:flex;flex-direction:column;align-items:center;justify-content:center;min-block-size:56px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:4px 2px;text-align:center}
.seg-n{font-weight:800;font-size:17px}.seg-l{font-size:11px;color:var(--text-2);line-height:1.2}
.seg-opt input:checked+.seg-face{background:var(--brand);border-color:var(--brand);color:var(--brand-on)}
.seg-opt input:checked+.seg-face .seg-l{color:inherit}
.seg-opt input:focus-visible+.seg-face{outline:3px solid var(--brand);outline-offset:2px}
.empty{text-align:center;color:var(--text-2);padding:24px 16px}
.field{display:block;margin-block:12px}.label{display:block;font:600 13px var(--font);margin-block-end:6px;color:var(--text-2)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row2 .field{margin-block:0}
input,textarea{inline-size:100%;min-block-size:48px;font:16px var(--font);color:var(--text);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
input[type=file]{padding:10px 0;background:transparent;border:0}
details{margin-block:12px;border:1px solid var(--line);border-radius:var(--r-md);padding:0 12px}
summary{min-block-size:var(--tap);display:flex;align-items:center;font-weight:600;cursor:pointer}
details[open]{padding-block-end:12px}
.thumbs{display:flex;gap:10px;flex-wrap:wrap;margin-block-end:4px}.thumbs:empty{display:none}
.thumb{position:relative;inline-size:88px;block-size:88px}.thumb img{inline-size:100%;block-size:100%;object-fit:cover;border-radius:12px;background:var(--surface-2)}
.thumb-x{position:absolute;inset-block-start:-8px;inset-inline-end:-8px;inline-size:32px;block-size:32px;border-radius:50%;border:2px solid var(--surface);background:var(--text);color:var(--surface);font:700 16px/1 var(--font);padding:0}
.thumb-x::after{content:"";position:absolute;inset:-6px}
.add-photo{display:flex;align-items:center;justify-content:center;gap:8px;min-block-size:52px;border:2px dashed var(--brand);border-radius:var(--r-md);color:var(--brand);font:700 16px var(--font);cursor:pointer}
.add-photo input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}
.add-photo:focus-within{outline:3px solid var(--brand);outline-offset:2px}.add-photo[hidden]{display:none}
.btn{min-block-size:52px;inline-size:100%;border:0;border-radius:var(--r-full);background:var(--brand);color:var(--brand-on);font:700 17px var(--font);padding:0 20px}
.btn:disabled{opacity:.6}.status{min-block-size:1.5em;margin:12px 0 0;font-weight:600}
.status.ok{color:var(--ok)}.status.err{color:var(--danger)}
.foot{text-align:center;color:var(--text-3);font-size:13px;margin-block-start:24px}
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

/** Strict CSP: only this response's inline script/style, same-origin fetches, images from self/data/blob/app. */
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
