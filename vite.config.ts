import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_SECURITY_HEADERS, appHeadersFile } from './shared/appHeaders.ts';

/** Production security headers for `vite preview`; `extraConnect` (an http://127.0.0.1:port origin) for local tests. */
function previewHeaders(extraConnect: string | undefined): Record<string, string> {
  if (!extraConnect || !/^http:\/\/127\.0\.0\.1:\d+$/.test(extraConnect)) return { ...APP_SECURITY_HEADERS };
  const csp = APP_SECURITY_HEADERS['Content-Security-Policy'];
  if (!csp) return { ...APP_SECURITY_HEADERS };
  return { ...APP_SECURITY_HEADERS, 'Content-Security-Policy': csp.replace("connect-src 'self'", `connect-src 'self' ${extraConnect}`) };
}

/** Short build stamp shown on the sign-in and About screens, so a screenshot tells which build a phone runs. */
function buildId(): string {
  const day = new Date().toISOString().slice(0, 10);
  try {
    return `${day}-${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`;
  } catch {
    return day;
  }
}

/** Emits `_headers` for Cloudflare Workers Static Assets (security headers + cache rules, see shared/appHeaders.ts). */
function cloudflareHeaders(): Plugin {
  return {
    name: 'pt-coach-cloudflare-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: appHeadersFile() });
    },
  };
}

/**
 * SEO with a known public origin (VITE_APP_ORIGIN, e.g. in .env.production): canonical + og:url, and absolute
 * og:image / twitter:image URLs (link previews ignore relative ones). Without it index.html stays as written.
 */
function seoOrigin(): Plugin {
  let origin = '';
  return {
    name: 'pt-coach-seo-origin',
    configResolved(config) {
      const value = config.env.VITE_APP_ORIGIN;
      origin = typeof value === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(value) ? value : '';
    },
    transformIndexHtml(html) {
      if (!origin) return html;
      const withImages = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")\//g, `$1${origin}/`);
      return {
        html: withImages,
        tags: [
          { tag: 'link', attrs: { rel: 'canonical', href: `${origin}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${origin}/` }, injectTo: 'head' },
        ],
      };
    },
  };
}

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId()) },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // jsPDF's optional deps (only for doc.html() / SVG, never used): keep them out of the bundle and precache.
      ...['html2canvas', 'dompurify', 'canvg'].map((dep) => ({
        find: new RegExp(`^${dep}$`),
        replacement: fileURLToPath(new URL('./src/services/pdf/jspdfUnusedDeps.ts', import.meta.url)),
      })),
    ],
  },
  // Same headers as production (deploy/app), so e2e and manual checks run under the real CSP. Not on the dev
  // server: Vite's HMR client needs inline scripts.
  // PREVIEW_EXTRA_CONNECT (npm run test:integration only) adds the local http Worker to connect-src; the production
  // _headers file and deploy/app never read it.
  preview: { headers: previewHeaders(process.env.PREVIEW_EXTRA_CONNECT) },
  plugins: [
    react(),
    cloudflareHeaders(),
    seoOrigin(),
    VitePWA({
      // A new version waits until the trainer taps "update" (src/app/pwa/swUpdate.ts) or closes the app: the open
      // page never mixes old code with a new precache. Registration is done by the app itself.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/',
        name: 'Coachly',
        short_name: 'Coachly',
        description: 'أداة المدرب الشخصي: العملاء، المواعيد، البرامج',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#f3f1ed',
        theme_color: '#f3f1ed',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache the whole app (every lazy route chunk and the bundled fonts) so it runs fully offline after
        // first load. Exercise photos (~21 MB) are NOT precached: they are cached on first view (route below).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,json,webmanifest,glb}'],
        // Draco decoders: the shipped model is not Draco-compressed, so never precache them (~0.8 MB).
        globIgnores: ['exercise-pack/img/**', 'assets/draco_*', 'draco/**', 'food-img/**'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/exercise-pack\//],
        cleanupOutdatedCaches: true,
        // clientsClaim: the very first install controls the open page at once (offline right after install).
        // No skipWaiting: updates activate on the trainer's tap (SKIP_WAITING message) or on the next cold start.
        clientsClaim: true,
        runtimeCaching: [
          {
            // Food photos (~4 MB): cached on first view or by "download all food photos"; same cache name as
            // src/features/nutrition/shared/foodPhotos.ts.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/food-img/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'food-photos',
              expiration: { maxEntries: 1000, purgeOnQuotaError: false },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/exercise-pack/img/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-photos',
              expiration: { maxEntries: 4000, purgeOnQuotaError: false },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
