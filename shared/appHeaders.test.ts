import { describe, expect, it } from 'vitest';
import { APP_CSP, appHeadersFile } from './appHeaders';

describe('appHeadersFile', () => {
  it('puts the security headers on every file and the cache rules on the right paths', () => {
    const file = appHeadersFile();
    expect(file.startsWith('/*\n')).toBe(true);
    expect(file).toContain(`  Content-Security-Policy: ${APP_CSP}`);
    expect(file).toContain('/sw.js\n  Cache-Control: no-cache');
    expect(file).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    // Cloudflare's limits: at most 100 rules, lines under 2,000 characters.
    expect(file.split('\n\n').length).toBeLessThan(100);
    expect(Math.max(...file.split('\n').map((l) => l.length))).toBeLessThan(2000);
  });
});
