import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: process.env.VITE_E2E === '1' ? 'dist-e2e' : 'dist' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
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
        background_color: '#f6f6f7',
        theme_color: '#f6f6f7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache the whole app (every lazy route chunk included) so it runs fully offline after first load.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,json,webmanifest,glb}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
