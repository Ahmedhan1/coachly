import { describe, expect, it } from 'vitest';
import { DRAFT_SYSTEM, draftSystem } from './draftPrompts';
import { buildSystemPrompt } from './prompt';

const base = { today: '2026-11-17', time: '10:05', weekday: 2, currency: 'EGP', focusClient: null };

describe('assistant language', () => {
  it('answers in Egyptian Arabic by default', () => {
    expect(buildSystemPrompt(base)).toContain('Egyptian Arabic');
    expect(draftSystem()).toBe(DRAFT_SYSTEM);
  });
  it('answers in English with English gym names when the app is in English', () => {
    const p = buildSystemPrompt({ ...base, language: 'en' });
    expect(p).toContain('plain English');
    expect(p).not.toContain('Egyptian Arabic');
    expect(p).not.toMatch(/[؀-ۿ]/);
    const d = draftSystem('en');
    expect(d).toContain('plain English');
    expect(d).not.toMatch(/[؀-ۿ]/);
    expect(d).toContain('Never suggest supplements');
  });
});
