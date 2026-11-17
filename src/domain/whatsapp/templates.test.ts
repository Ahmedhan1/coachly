import { describe, expect, it } from 'vitest';
import {
  mergeTemplates,
  normalizePhoneForWhatsapp,
  placeholdersIn,
  placeholderToken,
  renderTemplate,
  templateFor,
  whatsappLink,
  type WhatsappTemplate,
} from './templates';

describe('renderTemplate', () => {
  it('fills every known placeholder', () => {
    const r = renderTemplate('أهلاً {الاسم}، حصتك {الموعد}. باقتك {الباقة} بـ {المبلغ}', {
      الاسم: 'سارة',
      الموعد: 'بكرة 6:00 م',
      الباقة: '12 حصة',
      المبلغ: '3,000 ج.م',
    });
    expect(r.text).toBe('أهلاً سارة، حصتك بكرة 6:00 م. باقتك 12 حصة بـ 3,000 ج.م');
    expect(r.missing).toEqual([]);
  });

  it('drops missing values without leaving braces or double spaces, and reports them', () => {
    const r = renderTemplate('أهلاً {الاسم}، اشتراكك بـ {المبلغ} خلص', { الاسم: '  ' });
    expect(r.text).toBe('أهلاً، اشتراكك بـ خلص');
    expect(r.text).not.toMatch(/[{}]/);
    expect(r.missing).toEqual(['الاسم', 'المبلغ']);
  });

  it('keeps unknown {words}, tolerates spaces inside braces and repeated placeholders', () => {
    const r = renderTemplate('{ الاسم } و{الاسم} و{مش_معروف}', { الاسم: 'منى' });
    expect(r.text).toBe('منى ومنى و{مش_معروف}');
  });

  it('keeps line breaks but collapses runs of empty lines', () => {
    expect(renderTemplate('سطر 1\n\n\n\n{المبلغ}\nسطر 2', {}).text).toBe('سطر 1\n\nسطر 2');
  });

  it('lists placeholders in order without duplicates', () => {
    expect(placeholdersIn('{المبلغ} {الاسم} {المبلغ} {x}')).toEqual(['المبلغ', 'الاسم']);
  });
});

describe('normalizePhoneForWhatsapp', () => {
  it.each([
    ['01001234567', '201001234567'],
    ['0100 123 4567', '201001234567'],
    ['0112-222-3344', '201122223344'],
    ['01556667788', '201556667788'],
    ['1001234567', '201001234567'],
    ['+20 100 123 4567', '201001234567'],
    ['00201001234567', '201001234567'],
    ['+2001001234567', '201001234567'],
    ['+966 50 123 4567', '966501234567'],
    ['0223456789', '20223456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhoneForWhatsapp(input)).toBe(expected);
  });

  it('rejects empty and too-short input', () => {
    expect(normalizePhoneForWhatsapp('')).toBeNull();
    expect(normalizePhoneForWhatsapp('  ')).toBeNull();
    expect(normalizePhoneForWhatsapp('0123')).toBeNull();
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me link with URL-encoded Arabic text', () => {
    const url = whatsappLink('01001234567', 'أهلاً سارة & كده');
    expect(url.startsWith('https://wa.me/201001234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1] ?? '')).toBe('أهلاً سارة & كده');
  });
  it('without a phone, opens WhatsApp to pick the chat', () => {
    expect(whatsappLink('', 'hi')).toBe('https://wa.me/?text=hi');
    expect(whatsappLink('01001234567', '')).toBe('https://wa.me/201001234567');
  });
});

describe('mergeTemplates', () => {
  const defaults: WhatsappTemplate[] = [
    { id: 'session_reminder', kind: 'session_reminder', title: 'تذكير', body: 'a' },
    { id: 'renewal', kind: 'renewal', title: 'تجديد', body: 'b' },
    { id: 'record', kind: 'record', title: 'رقم', body: 'c' },
  ];
  it('returns defaults when nothing is stored', () => {
    expect(mergeTemplates(defaults, [])).toEqual(defaults);
  });
  it('a stored built-in edit wins, customs follow in order', () => {
    const stored: WhatsappTemplate[] = [
      { id: 'c1', kind: 'custom', title: 'مخصص', body: 'x' },
      { id: 'renewal', kind: 'renewal', title: 'تجديد', body: 'edited' },
    ];
    const merged = mergeTemplates(defaults, stored);
    expect(merged.map((m) => m.body)).toEqual(['a', 'edited', 'c', 'x']);
    expect(templateFor('renewal', merged)?.body).toBe('edited');
  });
});

describe('English placeholder aliases', () => {
  it('fills {name} {when} {package} {amount} like the Arabic placeholders', () => {
    const r = renderTemplate('Hi {name}, your session is {when}. {package} for {amount}.', {
      الاسم: 'Sara',
      الموعد: 'Wed 6 PM',
      الباقة: '12 sessions',
      المبلغ: 'EGP 3,000',
    });
    expect(r.text).toBe('Hi Sara, your session is Wed 6 PM. 12 sessions for EGP 3,000.');
    expect(placeholdersIn('Hi {name} {الاسم} {amount}')).toEqual(['الاسم', 'المبلغ']);
  });
  it('reports missing aliases by their canonical name and keeps unknown words', () => {
    const r = renderTemplate('Hi {name}, see {other}', {});
    expect(r.missing).toEqual(['الاسم']);
    expect(r.text).toBe('Hi, see {other}');
  });
  it('writes the token for the active language', () => {
    expect(placeholderToken('الموعد', true)).toBe('{when}');
    expect(placeholderToken('الموعد', false)).toBe('{الموعد}');
  });
});
