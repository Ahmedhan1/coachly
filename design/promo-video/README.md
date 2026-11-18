# Promo video (Arabic, vertical 1080×1920)

Two cuts, rendered from the real app:

- **Full explainer** (`story/scenes.mjs`, ~5:14): every feature with Arabic subtitles and side labels.
- **Teaser** (`story/teaser.mjs`, ~1:12): for Reels / TikTok / WhatsApp Status.

Everything is original: the footage is the app itself, the music is synthesized by `scripts/music.py` (no samples),
the fonts are the app's own OFL fonts (Readex Pro, Alexandria), and the emoji come from the system's Noto Color Emoji.
The demo trainer "كابتن مازن" and the logo in `assets/logo.html` are made up for the video.

## How it works

1. **Film** (`scripts/film.mjs`). Playwright drives an e2e build of the app (demo data, fake activation) and saves
   each clip as real frames, recording where every tap lands. Two parts are mocked inside the browser only, and
   nothing is sent anywhere:
   - The client page upload, served back to a second "client phone".
   - Groq's replies for the assistant scene.
2. **Timeline** (`scripts/build-timeline.mjs`). Scenes are measured in bars (1 bar = 2 s at 120 BPM), so every cut
   lands on the beat. The script also writes the music sections.
3. **Music** (`scripts/music.py`). Generates an A-minor house track (kick, clap, hats, pumping bass, supersaw pads,
   arp, risers, impacts) that follows those sections.
4. **Render** (`comp/comp.html` + `scripts/render.mjs`). An HTML page draws one frame at a time: the phone mockup,
   tap ripples, titles, side labels, word-by-word Arabic subtitles, and the text/logo/PDF/stats/CTA scenes.
   Chromium screenshots each frame.
5. **Encode** with ffmpeg.

## Rebuild after an app update

Run everything from this folder. `$APP_DIST` is any empty folder.

1. Build an e2e copy of the app and serve it on port 4400:

   ```bash
   (cd ../.. && VITE_E2E=1 npx vite build --outDir $APP_DIST --emptyOutDir)
   ```

   ```bash
   (cd ../.. && npx vite preview --outDir $APP_DIST --port 4400 --strictPort) &
   ```

2. Set up the scripts and the assets:

   ```bash
   ln -s ../../../node_modules scripts/node_modules
   ```

   ```bash
   npx esbuild scripts/viewer-entry.ts --bundle --platform=node --format=esm --outfile=scripts/viewer-gen.mjs
   ```

   ```bash
   mkdir -p comp/fonts && cp ../../public/fonts/*.woff2 comp/fonts/
   ```

   Then render `assets/logo.html` to `assets/logo.png` (512×512, transparent).

3. Film the clips:

   ```bash
   node scripts/film.mjs footage2
   ```

4. Build the timeline and the music:

   ```bash
   node scripts/build-timeline.mjs footage2 scenes.mjs timeline.js
   ```

   ```bash
   python3 scripts/music.py music-full.wav 157 "$(cat comp/timeline.sections.json)"
   ```

   The number of bars (157 here) is printed by `build-timeline.mjs`.

5. Serve this folder so the page can load its fonts and frames:

   ```bash
   python3 -m http.server 4500 --bind 127.0.0.1 &
   ```

6. Render the frames:

   ```bash
   node scripts/render.mjs timeline.js frames-full 4
   ```

7. Encode the video:

   ```bash
   ffmpeg -framerate 30 -i frames-full/%05d.jpg -i music-full.wav -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart out/full.mp4
   ```

For the teaser, use `teaser.mjs` and `timeline-teaser.js` in steps 4, 6 and 7.

Subtitles and labels are user-visible Arabic, so they follow the transliteration rules. Copy the `story/*.mjs`
files into a temporary `src/i18n/` folder, then run `node scripts/check-forbidden-words.mjs --root <that folder>`.
