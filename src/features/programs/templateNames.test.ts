import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES } from '@/domain/programs';
import { findForbiddenTerms } from '@/i18n/fitness-terms';
import { ar } from '@/i18n/ar';
import { en } from '@/i18n/en';

const AR = ar.training.programs;
const EN = en.training?.programs;

describe('built-in template names', () => {
  it('every template and day has an Arabic and an English name', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(AR.templates[tpl.id as keyof typeof AR.templates], tpl.id).toBeTruthy();
      expect(EN?.templates?.[tpl.id as keyof typeof AR.templates], tpl.id).toBeTruthy();
      for (const d of tpl.days) {
        expect(AR.dayNames[d.key as keyof typeof AR.dayNames], d.key).toBeTruthy();
        expect(EN?.dayNames?.[d.key as keyof typeof AR.dayNames], d.key).toBeTruthy();
      }
    }
  });

  it('day labels are unique per language, so a stored day name maps back to one key', () => {
    for (const labels of [Object.values(AR.dayNames), Object.values(EN?.dayNames ?? {})]) {
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('Arabic names are transliterated, never translated', () => {
    const text = [...Object.values(AR.templates), ...Object.values(AR.dayNames)].join('\n');
    expect(findForbiddenTerms(text)).toEqual([]);
  });
});
