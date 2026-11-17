import { describe, expect, it } from 'vitest';
import { escapeText, foldLine, serializeLines, utf8ByteLength } from './text';

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d\ne\r\nf\rg')).toBe('a\\,b\\;c\\\\d\\ne\\nf\\ng');
  });

  it('keeps Arabic text and drops control characters', () => {
    expect(escapeText('حصة، سكوات\u0007')).toBe('حصة، سكوات');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:hi')).toEqual(['SUMMARY:hi']);
  });

  it('folds ASCII at exactly 75 octets, continuation lines carry a leading space', () => {
    const line = 'X'.repeat(200);
    const parts = foldLine(line);
    expect(parts.map((p) => utf8ByteLength(p))).toEqual([75, 75, 52]); // 75 + (1+74) + (1+51) = 200 chars + 2 spaces
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('never splits a multi-byte Arabic character and stays within 75 octets', () => {
    // "SUMMARY:" is 8 octets, each Arabic letter is 2 octets.
    const line = 'SUMMARY:' + 'م'.repeat(100);
    const parts = foldLine(line);
    for (const p of parts) {
      expect(utf8ByteLength(p)).toBeLessThanOrEqual(75);
      // re-encoding each piece on its own must round-trip: no broken sequence
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(p))).toBe(p);
    }
    // first line: 8 + 33*2 = 74 (a 34th letter would make 76)
    expect(utf8ByteLength(parts[0] ?? '')).toBe(74);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('keeps 4-byte emoji (surrogate pairs) intact', () => {
    const line = 'DESCRIPTION:' + '💪'.repeat(40);
    const parts = foldLine(line);
    expect(parts.every((p) => utf8ByteLength(p) <= 75)).toBe(true);
    expect(parts.join('')).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('serializeLines', () => {
  it('uses CRLF everywhere and ends with CRLF', () => {
    expect(serializeLines(['A', 'B'])).toBe('A\r\nB\r\n');
  });
});
