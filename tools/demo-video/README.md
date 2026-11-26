# Demo video (vertical 1080×1920, ~61 s, with music)

Fast demo of the real app (Pebble design) on a tilted 3D phone: sign-in, home, clients, training programs, the
exercise library, the 3D muscle model, gym team, approval, a trainer's clients, settings. Output: `docs/video/pt-coach-demo.mp4`.

1. Serve an e2e build of the app on port 4410:

   ```bash
   VITE_E2E=1 npx vite build --outDir node_modules/.video-dist --emptyOutDir
   ```

   ```bash
   npx vite preview --outDir node_modules/.video-dist --port 4410 --strictPort
   ```

2. Record (Playwright drives the app on an iPhone-sized screen; the account server is mocked in the browser;
   a tap ripple marks each press; frames are full 2× pixels):

   ```bash
   node tools/demo-video/record.mjs /tmp/demo
   ```

3. Compose (3D phone built with CSS and rendered by Chromium, footage perspective-mapped onto its screen, captions,
   intro/outro cards, music from `music.mjs`; no camera zoom; cuts off-camera parts):

   ```bash
   node tools/demo-video/compose.mjs /tmp/demo docs/video/pt-coach-demo.mp4
   ```

The music is synthesized by `music.mjs` and the phone is drawn in CSS, so there is no third-party asset to license.
Everything shown is the app itself; the demo trainer and gym names are made up.
