import { describe, expect, it } from 'vitest';
import { ar, t, tParts } from './index';

describe('t()', () => {
  it('looks up nested keys', () => {
    expect(t('tabs.home')).toBe('الرئيسية');
    expect(t('activation.errors.used')).toBe(ar.activation.errors.used);
  });
  it('interpolates params with Western digits', () => {
    expect(t('clients.remaining', { n: 12 })).toBe('باقي 12 حصة');
    expect(t('home.greetingNamed', { name: 'محمد' })).toBe('أهلاً يا كابتن محمد');
  });
  it('leaves unknown placeholders visible', () => {
    expect(t('clients.remaining')).toContain('{n}');
  });
  it('contains no Arabic-Indic digits anywhere', () => {
    expect(JSON.stringify(ar)).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe('tParts()', () => {
  it('splits a template around parameters of any type', () => {
    const node = { n: 5 };
    expect(tParts('clients.remaining', { n: node })).toEqual(['باقي ', node, ' حصة']);
    expect(tParts('home.sessionOf', { n: 8, total: 12 })).toEqual(['الحصة ', '8', ' من ', '12']);
  });
  it('keeps unknown placeholders as text', () => {
    expect(tParts('clients.remaining', {}).join('')).toBe('باقي {n} حصة');
  });
});
