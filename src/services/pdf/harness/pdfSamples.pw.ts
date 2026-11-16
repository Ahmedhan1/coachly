import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { HarnessResult } from './harness';

const OUT = join(process.cwd(), 'docs', 'pdf-samples');
const CASES = ['no_images', 'fifty_exercises', 'long_names', 'mixed_text', 'max_branding'] as const;

test.describe.configure({ mode: 'serial' });

for (const id of CASES) {
  test(`spec test PDF: ${id}`, async ({ page }) => {
    page.on('pageerror', (e) => console.log(`[page error] ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && console.log(`[console] ${m.text()}`));
    await page.goto('/src/services/pdf/harness/index.html');
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 60_000 });
    const r: HarnessResult = await page.evaluate((c) => window.__pdfHarness!.render(c), id);
    expect(r.ok, r.error).toBe(true);
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `${id}.pdf`);
    writeFileSync(file, Buffer.from(r.base64, 'base64'));
    console.log(`[pdf] ${id}: pages=${r.pages} bytes=${r.bytes} (${(r.bytes / 1048576).toFixed(2)} MB) ms=${r.ms} heapMB=${r.heapMB}`);
    expect(r.pages).toBeGreaterThan(1);
    expect(r.bytes).toBeLessThan(15 * 1024 * 1024);
    // Rasterise the first two pages for review (poppler, when installed).
    try {
      execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '3', file, join(OUT, id)]);
    } catch {
      console.log('[pdf] pdftoppm not available; skipped PNGs');
    }
  });
}
