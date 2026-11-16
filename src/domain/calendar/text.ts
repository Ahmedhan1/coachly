/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma and newlines. Control characters are dropped. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** UTF-8 byte length of a string. */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (const ch of s) n += utf8Length(ch.codePointAt(0) ?? 0);
  return n;
}

export const MAX_LINE_OCTETS = 75;

/**
 * RFC 5545 §3.1 line folding: no line longer than 75 octets (excluding CRLF); continuation lines start
 * with one space, which counts toward their 75. Splits only between code points, so a multi-byte UTF-8
 * character (Arabic letters are 2 bytes, emoji 4) is never cut in half.
 */
export function foldLine(line: string, maxOctets: number = MAX_LINE_OCTETS): string[] {
  const out: string[] = [];
  let current = '';
  let size = 0;
  let limit = maxOctets;
  for (const ch of line) {
    const len = utf8Length(ch.codePointAt(0) ?? 0);
    if (size + len > limit) {
      out.push(current);
      current = ' ';
      size = 1;
      limit = maxOctets;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out;
}

/** Fold every content line and join with CRLF, ending with a final CRLF. */
export function serializeLines(lines: readonly string[]): string {
  return lines.flatMap((l) => foldLine(l)).join('\r\n') + '\r\n';
}
