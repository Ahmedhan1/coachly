import { describe, expect, it } from 'vitest';
import { ar, t } from './index';

describe('t()', () => {
  it('looks up nested keys', () => {
    expect(t('tabs.home')).toBe('الرئيسية');
    expect(t('activation.errors.used')).toBe(ar.activation.errors.used);
  });
  it('interpolates params with Western digits', () => {
    expect(t('clients.remaining', { n: 12 })).toBe('الحصص المتبقية: 12');
    expect(t('home.greetingNamed', { name: 'محمد' })).toBe('أهلاً يا كابتن محمد');
  });
  it('leaves unknown placeholders visible', () => {
    expect(t('clients.remaining')).toContain('{n}');
  });
  it('contains no Arabic-Indic digits anywhere', () => {
    expect(JSON.stringify(ar)).not.toMatch(/[٠-٩۰-۹]/);
  });
});
