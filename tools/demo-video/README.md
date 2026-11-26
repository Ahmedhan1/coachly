# Demo video (vertical 1080×1920, ~36 s)

Fast motion demo of the real app (Pebble design): sign-in, home, clients, gym team, approval, a trainer's clients,
settings. Output: `docs/video/pt-coach-demo.mp4`.

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

3. Compose (phone frame, captions, intro/outro cards, eased camera zoom toward taps, cuts off-camera parts):

   ```bash
   node tools/demo-video/compose.mjs /tmp/demo docs/video/pt-coach-demo.mp4
   ```

No music. Everything shown is the app itself; the demo trainer and gym names are made up.
