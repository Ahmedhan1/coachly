import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VIEWER_FONTS } from '../worker/src/share/viewerFonts';

describe('client page fonts (worker/src/share/viewerFonts.ts)', () => {
  it('are byte-identical to the app font in public/fonts, with the content hash in the path', () => {
    expect(VIEWER_FONTS.map((f) => f.path.replace(/\.[0-9a-f]{10}\.woff2$/, ''))).toEqual(['/c/_/rubik-arabic', '/c/_/rubik-latin']);
    for (const f of VIEWER_FONTS) {
      const name = f.path.slice('/c/_/'.length).replace(/\.[0-9a-f]{10}\.woff2$/, '');
      const bytes = readFileSync(new URL(`../public/fonts/${name}.woff2`, import.meta.url));
      // If this fails, the app font changed: run `node worker/scripts/gen-viewer-fonts.mjs`.
      expect(f.base64).toBe(bytes.toString('base64'));
      expect(f.path).toContain(createHash('sha256').update(bytes).digest('hex').slice(0, 10));
    }
  });
});
