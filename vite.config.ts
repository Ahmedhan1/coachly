import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Fails loudly (but does not stop the build) while the license public key is still the placeholder. */
function licenseKeyWarning(): Plugin {
  return {
    name: 'pt-coach-license-key-warning',
    buildStart() {
      const file = fileURLToPath(new URL('./src/services/license/publicKey.ts', import.meta.url));
      const source = readFileSync(file, 'utf8');
      if (source.includes("'REPLACE_WITH_PUBLIC_KEY_HEX'")) {
        const line = '!'.repeat(78);
        console.warn(
          `\n${line}\n  LICENSE PUBLIC KEY IS NOT SET (src/services/license/publicKey.ts).\n` +
            `  This build cannot verify any real activation code. See docs/ACTIVATION.md step 1.\n${line}\n`,
        );
      }
    },
  };
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    licenseKeyWarning(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icons/*.png', 'fonts/*.woff2'],
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
        background_color: '#ededea',
        theme_color: '#ededea',
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
        globIgnores: ['exercise-pack/img/**'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/exercise-pack\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
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
