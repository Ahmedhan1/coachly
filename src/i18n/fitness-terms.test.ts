import { describe, expect, it } from 'vitest';
import {
  DATASET_FIELD_TERMS,
  FITNESS_TERMS,
  FORBIDDEN_TERMS,
  findForbiddenTerms,
  naturalExerciseName,
  normalizeArabic,
  transliterateExerciseName,
} from './fitness-terms';

describe('transliterateExerciseName', () => {
  it.each([
    ['Glutes', 'جلوتس'],
    ['Quads', 'كوادز'],
    ['Hamstrings', 'هامسترينج'],
    ['Lats', 'لاتس'],
    ['Traps', 'ترابس'],
    ['Chest', 'تشيست'],
    ['Shoulders', 'شولدرز'],
    ['Triceps', 'ترايسبس'],
    ['Forearms', 'فورآرمز'],
    ['Abs', 'أبس'],
    ['Calves', 'كالفز'],
    ['Biceps Curl', 'بايسبس كيرل'],
    ['Bench Press', 'بنش برس'],
    ['Deadlift', 'ديدليفت'],
    ['Hip Thrust', 'هيب ثرست'],
    ['Lat Pulldown', 'لات بول داون'],
    ['Barbell Squat', 'بار سكوات'],
    ['Incline Dumbbell Flyes', 'إنكلاين دامبل فلاي'],
    ['Seated Cable Rows', 'سيتد كابل رو'],
  ])('%s → %s', (english, arabic) => {
    expect(transliterateExerciseName(english)).toEqual({ arabic, unknownTokens: [] });
  });

  it('matches multi-word phrases before single words', () => {
    // "lat pulldown" as a phrase, not "lat" + "pull" + "down"
    expect(transliterateExerciseName('Wide-Grip Lat Pulldown').arabic).toBe('وايد جريب لات بول داون');
    expect(transliterateExerciseName('Romanian Deadlift').arabic).toBe('رومانيان ديدليفت');
  });

  it('treats hyphens as spaces', () => {
    expect(transliterateExerciseName('Sit-Up').arabic).toBe('سيت أب');
    expect(transliterateExerciseName('One-Arm Dumbbell Row').arabic).toBe('ون آرم دامبل رو');
  });

  it('keeps numbers and fractions', () => {
    expect(transliterateExerciseName('3/4 Sit-Up').arabic).toBe('3/4 سيت أب');
    expect(transliterateExerciseName("Landmine 180's").arabic).toBe('لاندماين 180');
  });

  it('keeps slashes between words and parentheses', () => {
    expect(transliterateExerciseName('Knee/Hip Raise').arabic).toBe('ني / هيب رايز');
    expect(transliterateExerciseName('Machine Shoulder (Military) Press').arabic).toBe(
      'ماشين شولدر (ميليتري) برس',
    );
  });

  it('attaches "and" to the next word and drops articles', () => {
    expect(transliterateExerciseName('Close and Wide').arabic).toBe('كلوز ووايد');
    expect(transliterateExerciseName('Barbell Squat To A Bench').arabic).toBe('بار سكوات لحد بنش');
  });

  it('says body positions the way Egyptian trainers do', () => {
    expect(transliterateExerciseName('Barbell Shrug Behind The Back').arabic).toBe('بار شراج ورا الضهر');
    expect(transliterateExerciseName('Behind Head Chest Stretch').arabic).toBe('ورا الراس تشيست ستريتش');
    expect(transliterateExerciseName('Calf Stretch Hands Against Wall').arabic).toBe('كالف ستريتش هاندز على الحيطة');
    expect(transliterateExerciseName('Bent Over Two-Dumbbell Row With Palms In').arabic).toBe('بنت أوفر دامبلين رو مع الكفوف لجوه');
  });

  it('handles possessives', () => {
    expect(transliterateExerciseName("Farmer's Walk").arabic).toBe('فارمرز ووك');
  });

  it('reports unknown words and keeps them visible in the output', () => {
    const result = transliterateExerciseName('Zorblax Curl');
    expect(result.unknownTokens).toEqual(['zorblax']);
    expect(result.arabic).toBe('Zorblax كيرل');
  });

  it('returns an empty name for empty input', () => {
    expect(transliterateExerciseName('  ')).toEqual({ arabic: '', unknownTokens: [] });
  });
});

describe('dictionary hygiene', () => {
  it('has lower-case keys without apostrophes or hyphens', () => {
    for (const key of FITNESS_TERMS.keys()) {
      expect(key).toBe(key.toLowerCase());
      expect(key).not.toMatch(/['_]/);
    }
  });

  it('never maps a term to a forbidden literal translation', () => {
    const values = [
      ...FITNESS_TERMS.values(),
      ...Object.values(DATASET_FIELD_TERMS).flatMap((group) => Object.values(group)),
    ];
    for (const value of values) expect(findForbiddenTerms(value)).toEqual([]);
  });

  it('never produces a forbidden word for the spec examples', () => {
    for (const name of ['Glutes', 'Biceps Curl', 'Quads', 'Hamstrings', 'Lats', 'Chest', 'Calves', 'Deadlift']) {
      expect(findForbiddenTerms(transliterateExerciseName(name).arabic)).toEqual([]);
    }
  });
});

describe('findForbiddenTerms', () => {
  const sample = FORBIDDEN_TERMS[0] ?? '';

  it('finds a forbidden term inside a sentence', () => {
    expect(findForbiddenTerms(`تمرين ${sample} للمبتدئين`)).toContain(sample);
  });

  it('ignores tashkeel and tatweel', () => {
    const decorated = [...sample].join('َ').replace(/(.)/, '$1ـ');
    expect(findForbiddenTerms(decorated)).toContain(sample);
  });

  it('passes clean text', () => {
    expect(findForbiddenTerms('جلوتس، بايسبس كيرل، كوادز')).toEqual([]);
  });

  it('normalizes alef forms', () => {
    expect(normalizeArabic('أإآا')).toBe('اااا');
  });
});

describe('naturalExerciseName (Egyptian gym-floor order)', () => {
  it.each([
    ['Barbell Bench Press - Medium Grip', 'بنش برس بالبار'],
    ['Incline Dumbbell Press', 'برس بالدامبل عالي (إنكلاين)'],
    ['Dumbbell Shoulder Press', 'شولدر برس بالدامبل'],
    ['Barbell Squat', 'سكوات بالبار'],
    ['Wide-Grip Lat Pulldown', 'لات بول داون - قبضة واسعة'],
    ['Seated Cable Rows', 'رو على الكابل قاعد'],
    ['Smith Machine Close-Grip Bench Press', 'بنش برس على السميث - قبضة ضيقة'],
    ['One-Arm Dumbbell Row', 'رو بالدامبل بإيد واحدة'],
    ['Decline EZ Bar Triceps Extension', 'ترايسبس إكستنشن بالبار الزجزاج واطي (ديكلاين)'],
    ['Ab Crunch Machine', 'أب كرانش على الماشين'],
    ['Narrow Stance Leg Press', 'ليج برس - رجل ضيقة'],
    ['Dips - Triceps Version', 'ديبس ترايسبس'],
  ])('%s → %s', (english, arabic) => {
    expect(naturalExerciseName(english)).toEqual({ arabic, unknownTokens: [] });
  });

  it('never repeats the cable when the pulley height is given', () => {
    expect(naturalExerciseName('One-Arm High-Pulley Cable Side Bends').arabic).toBe('سايد بيند على الكابل من فوق بإيد واحدة');
  });

  it('falls back to plain transliteration when the name is only a tool', () => {
    expect(naturalExerciseName('Barbell').arabic).toBe('بار');
  });

  it('never yields a forbidden word', () => {
    for (const name of ['Barbell Deadlift', 'Barbell Hip Thrust', 'Dumbbell Lunges', 'Seated Cable Rows', 'Side Lateral Raise']) {
      expect(findForbiddenTerms(naturalExerciseName(name).arabic)).toEqual([]);
    }
  });
});
