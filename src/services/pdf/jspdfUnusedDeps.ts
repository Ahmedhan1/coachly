/**
 * Build-time stand-in for jsPDF's optional dependencies (html2canvas, dompurify, canvg), aliased in
 * vite.config.ts. jsPDF loads them only for `doc.html()` and SVG rendering, which this app never uses (pages are
 * rasterised with html-to-image and added with `addImage`). Without the alias ~370 KB of unused code would be
 * emitted and precached by the service worker on every install. If a future change reaches one of those jsPDF
 * paths, it fails loudly here instead of silently pulling the libraries back in.
 */
function unused(): never {
  throw new Error('jsPDF optional dependency is not bundled (see src/services/pdf/jspdfUnusedDeps.ts)');
}

export default unused;
export const Canvg = { fromString: unused };
export const sanitize = unused;
