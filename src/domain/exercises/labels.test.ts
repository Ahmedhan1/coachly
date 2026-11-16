import { describe, expect, it } from 'vitest';
import { findForbiddenTerms } from '../../i18n/fitness-terms';
import {
  CATEGORY_LABELS_AR,
  EQUIPMENT_LABELS_AR,
  LEVEL_LABELS_AR,
  MUSCLE_GROUPS,
  isMuscleGroupId,
  muscleGroup,
  muscleGroupLabelAr,
} from './labels';
import { CATEGORY_IDS, EQUIPMENT_IDS, MUSCLE_GROUP_IDS } from './pack';

describe('MUSCLE_GROUPS', () => {
  it('describes every group id exactly once, in id order', () => {
    expect(MUSCLE_GROUPS.map((g) => g.id)).toEqual([...MUSCLE_GROUP_IDS]);
  });

  it('uses the transliterated dictionary labels, never a translation', () => {
    expect(muscleGroupLabelAr('glutes')).toBe('جلوتس');
    expect(muscleGroupLabelAr('quads')).toBe('كوادز');
    expect(muscleGroupLabelAr('hamstrings')).toBe('هامسترينج');
    expect(muscleGroupLabelAr('lats')).toBe('لاتس');
    expect(muscleGroupLabelAr('lower_back')).toBe('لوور باك');
    for (const group of MUSCLE_GROUPS) {
      expect(group.labelAr).not.toBe('');
      expect(findForbiddenTerms(group.labelAr)).toEqual([]);
    }
  });

  it('places every group on the front and/or back body view', () => {
    expect(muscleGroup('glutes').views).toEqual(['back']);
    expect(muscleGroup('chest').views).toEqual(['front']);
    for (const group of MUSCLE_GROUPS) expect(group.views.length).toBeGreaterThan(0);
  });

  it('guards ids', () => {
    expect(isMuscleGroupId('glutes')).toBe(true);
    expect(isMuscleGroupId('butt')).toBe(false);
  });
});

describe('field labels', () => {
  it('labels every equipment and category id from the dictionary', () => {
    for (const id of EQUIPMENT_IDS) expect(EQUIPMENT_LABELS_AR[id]).not.toBe('');
    for (const id of CATEGORY_IDS) expect(CATEGORY_LABELS_AR[id]).not.toBe('');
    expect(EQUIPMENT_LABELS_AR.dumbbell).toBe('دامبل');
    expect(EQUIPMENT_LABELS_AR.body_only).toBe('بودي ويت');
    expect(CATEGORY_LABELS_AR.olympic_weightlifting).toBe('أوليمبيك ويتليفتينج');
    expect(LEVEL_LABELS_AR.expert).toBe('متقدم');
  });
});
