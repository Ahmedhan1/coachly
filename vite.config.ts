import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_SECURITY_HEADERS, appHeadersFile } from './shared/appHeaders.ts';

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
  preview: { headers: { ...APP_SECURITY_HEADERS } },
  plugins: [
    react(),
    cloudflareHeaders(),
    VitePWA({
      // A new version waits until the trainer taps "update" (src/app/pwa/swUpdate.ts) or closes the app: the open
      // page never mixes old code with a new precache. Registration is done by the app itself.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/',
        name: 'كوتش',
        short_name: 'كوتش',
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
