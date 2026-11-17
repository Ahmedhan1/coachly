import { describe, expect, it } from 'vitest';
import { cleanPhoneInput, phoneProblem, toWesternDigits } from './phone';
import { normalizePhoneForWhatsapp } from './templates';

describe('toWesternDigits', () => {
  it('turns Arabic-Indic and Persian digits into 0-9', () => {
    expect(toWesternDigits('٠١٠٠١٢٣٤٥٦٧')).toBe('01001234567');
    expect(toWesternDigits('۰۱۲۳')).toBe('0123');
    expect(toWesternDigits('a1٢')).toBe('a12');
  });
});

describe('cleanPhoneInput', () => {
  it('keeps digits, +, spaces and dashes and converts Arabic digits as the trainer types', () => {
    expect(cleanPhoneInput('٠١٠ ١٢٣-٤٥٦٧')).toBe('010 123-4567');
    expect(cleanPhoneInput('+20 (100) abc')).toBe('+20 100 ');
  });
});

describe('phoneProblem', () => {
  it.each(['', '  ', '01001234567', '0100 123 4567', '01122223344', '01256667788', '01556667788', '+20 100 123 4567', '00201001234567', '1001234567', '0223456789', '+966 50 123 4567', '٠١٠٠١٢٣٤٥٦٧'])(
    '%s is fine',
    (phone) => expect(phoneProblem(phone)).toBeNull(),
  );

  it.each([
    ['0100123456', 'egypt_mobile'], // 10 digits
    ['010012345678', 'egypt_mobile'], // 12 digits
    ['01301234567', 'egypt_mobile'], // no 013 network
    ['+20 100 123 456', 'egypt_mobile'],
    ['12345', 'too_short'],
    ['+1234567890123456', 'too_long'],
  ])('%s → %s', (phone, problem) => expect(phoneProblem(phone)).toBe(problem));
});

describe('normalizePhoneForWhatsapp with Arabic digits', () => {
  it('reads ٠١٠… like 010…', () => {
    expect(normalizePhoneForWhatsapp('٠١٠٠١٢٣٤٥٦٧')).toBe('201001234567');
  });
});
