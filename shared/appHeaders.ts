// HTTP security headers for the installed PWA. One source for the production app server
// (deploy/app/src/index.ts) and `vite preview` (vite.config.ts), so e2e runs under the same policy.
//
// Why each CSP source is needed (verified against the built app, docs/MANUAL_QA.md "CSP"):
// - script-src 'wasm-unsafe-eval': the Draco mesh decoder (public/draco) compiles WebAssembly. No 'unsafe-eval'.
// - style-src 'unsafe-inline': React `style` props are CSSOM (allowed anyway), but the PDF renderer builds pages
//   as HTML strings with style="" attributes and one <style> element (src/services/pdf). Scripts stay strict.
// - img-src data: blob:: photos and logos are object URLs; html-to-image snapshots PDF pages via data: SVG.
// - connect-src https: blob: data:: the license Worker and api.anthropic.com (AI helper, browser-direct) are
//   https, and the trainer's own webhook (n8n/Make) can be any https host, so hosts cannot be listed. blob:/data:
//   because html-to-image fetches page images to inline them. Plain http and ws are still refused.
// - worker-src/child-src blob:: three's DRACOLoader starts its decoder worker from a blob: URL (child-src is the
//   CSP2 fallback older WebKit reads for workers).
// - frame-src blob:: the PDF preview <iframe> shows the generated PDF object URL.

export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: blob: data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Features the app never uses. File inputs (photo picker / camera sheet) are not affected by these. */
export const APP_PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'midi=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'browsing-topics=()',
].join(', ');

/** Sent on every app response, errors included. */
export const APP_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': APP_CSP,
  'Permissions-Policy': APP_PERMISSIONS_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // .dev is HSTS-preloaded already; this also covers a future custom domain. No includeSubDomains/preload:
  // the owner does not control sibling hosts.
  'Strict-Transport-Security': 'max-age=63072000',
};
