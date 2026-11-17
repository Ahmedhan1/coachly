// The client page served at GET /c/:shareId: one self-contained Arabic RTL HTML document, inline CSS/JS with a
// per-response nonce, no third-party requests. The key is read from location.hash and never reaches the server.
// Styling follows design direction B (design/direction-b/tokens.css) with system fonts (no font downloads).
// The 3D muscle model is deferred on this page (see docs/CLOUD.md).
import { escapeHtml } from '../admin/html';
import { VIEWER_SCRIPT } from './viewerScript';

const STYLE = `
:root{color-scheme:light dark;--bg:#EDEDEA;--surface:#FFFFFF;--surface-2:#F3F3F1;--line:#E3E3DF;--text:#0E0F0F;--text-2:#4A4D4E;
--brand:#F25C1F;--brand-on:#111111;--danger:#B42318;--ok:#1B7040;--r-md:14px;--r-full:999px;--tap:44px;
--font:system-ui,-apple-system,"SF Arabic","Segoe UI",Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0B0C0C;--surface:#161818;--surface-2:#1F2222;--line:#252828;--text:#F2F3F1;--text-2:#A3A8A6;--danger:#FF8A7E;--ok:#5CC88A}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.55 var(--font);font-variant-numeric:lining-nums tabular-nums}
#brand{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;padding-block-start:max(8px,env(safe-area-inset-top));
background:var(--brand);color:var(--brand-on);font-weight:700;font-size:17px}
#brand .logo{inline-size:40px;block-size:40px;object-fit:contain;border-radius:10px;background:#fff}
main{max-inline-size:640px;margin:0 auto;padding:16px;padding-block-end:max(24px,env(safe-area-inset-bottom))}
h1{font:800 26px/1.2 var(--font);margin:8px 0 4px}h2{font:700 20px/1.3 var(--font);margin:16px 0 8px}
h3{font:700 17px/1.35 var(--font);margin:0 0 8px;display:flex;justify-content:space-between;gap:8px}
.sub{color:var(--text-2);font-size:14px;margin:4px 0 0}.pre{white-space:pre-wrap;margin:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:16px;margin-block:12px}
.msg p{margin:0 0 12px}
.tabs{position:sticky;top:0;z-index:1;display:flex;gap:4px;padding:4px;margin-block:12px;background:var(--surface-2);border-radius:var(--r-full);border:1px solid var(--line)}
.tab{flex:1;min-block-size:var(--tap);border:0;border-radius:var(--r-full);background:transparent;color:var(--text);font:600 15px var(--font)}
.tab[aria-selected="true"]{background:var(--brand);color:var(--brand-on)}
.list,.items{list-style:none;margin:0;padding:0}
.ex{display:flex;gap:12px;padding-block:12px;border-block-start:1px solid var(--line)}.ex:first-child{border-block-start:0;padding-block-start:0}
.ex-img{inline-size:72px;block-size:72px;flex:none;object-fit:cover;border-radius:10px;background:var(--surface-2)}
.ex-body{min-inline-size:0}.ex-name{font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-block-start:6px}
.chip{font-size:13px;padding:2px 10px;border-radius:var(--r-full);background:var(--surface-2);border:1px solid var(--line)}
.items li{padding-block:6px;border-block-start:1px solid var(--line)}.items li:first-child{border-block-start:0}
.time{font-weight:500;color:var(--text-2);font-size:14px}
.supp{padding-block:8px;border-block-start:1px solid var(--line)}.supp:nth-of-type(1){border-block-start:0}
.field{display:block;margin-block:12px}.label{display:block;font:600 13px var(--font);margin-block-end:6px;color:var(--text-2)}
input,textarea{inline-size:100%;min-block-size:48px;font:16px var(--font);color:var(--text);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
input[type=file]{padding:10px 0;background:transparent;border:0}
.btn{min-block-size:var(--tap);inline-size:100%;border:0;border-radius:var(--r-full);background:var(--brand);color:var(--brand-on);font:700 16px var(--font);padding:0 20px}
.btn:disabled{opacity:.6}.status{min-block-size:1.5em;margin:12px 0 0;font-weight:600}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
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
<title>برنامجك</title><style nonce="${nonce}">${STYLE}</style></head>
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
