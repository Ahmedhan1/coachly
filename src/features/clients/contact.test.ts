import { describe, expect, it } from 'vitest';
import { telUrl, whatsappUrl } from './contact';

describe('whatsappUrl', () => {
  it.each([
    ['01001234567', 'https://wa.me/201001234567'],
    ['010 0123 4567', 'https://wa.me/201001234567'],
    ['+20 100 123 4567', 'https://wa.me/201001234567'],
    ['00966501234567', 'https://wa.me/966501234567'],
    ['+966-50-123-4567', 'https://wa.me/966501234567'],
  ])('%s -> %s', (phone, url) => expect(whatsappUrl(phone)).toBe(url));

  it('returns null for empty or too-short input', () => {
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl('123')).toBeNull();
  });
});

describe('telUrl', () => {
  it('keeps digits and a leading +', () => {
    expect(telUrl('+20 100-123')).toBe('tel:+20100123');
  });
});
