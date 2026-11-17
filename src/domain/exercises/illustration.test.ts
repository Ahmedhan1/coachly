import { describe, expect, it } from 'vitest';
import { illustrationKey, illustrationSpec, PRIMARY_INTENSITY, SECONDARY_INTENSITY } from './illustration';

const base = { primaryMuscles: [] as const, secondaryMuscles: [] as const };

describe('illustrationSpec', () => {
  it('colours primary muscles strongly and secondary muscles lighter', () => {
    const spec = illustrationSpec({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] });
    expect(spec.intensities).toEqual({ chest: PRIMARY_INTENSITY, triceps: SECONDARY_INTENSITY, shoulders: SECONDARY_INTENSITY });
    expect(SECONDARY_INTENSITY).toBeLessThan(PRIMARY_INTENSITY);
  });

  it('a muscle that is both primary and secondary stays primary', () => {
    const spec = illustrationSpec({ primaryMuscles: ['quads'], secondaryMuscles: ['quads', 'glutes'] });
    expect(spec.intensities.quads).toBe(PRIMARY_INTENSITY);
  });

  it('shows the front for chest, abs, biceps, quads work', () => {
    expect(illustrationSpec({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] }).view).toBe('front');
    expect(illustrationSpec({ primaryMuscles: ['abs'], secondaryMuscles: [] }).view).toBe('front');
    expect(illustrationSpec({ primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hamstrings'] }).view).toBe('front');
  });

  it('shows the back for lats, glutes, hamstrings, lower back, triceps work', () => {
    expect(illustrationSpec({ primaryMuscles: ['lats'], secondaryMuscles: ['biceps'] }).view).toBe('back');
    expect(illustrationSpec({ primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'] }).view).toBe('back');
    expect(illustrationSpec({ primaryMuscles: ['lower_back'], secondaryMuscles: [] }).view).toBe('back');
    expect(illustrationSpec({ primaryMuscles: ['triceps'], secondaryMuscles: ['chest'] }).view).toBe('back');
  });

  it('primary muscles decide over secondary ones', () => {
    // chest (front) primary outweighs two back secondaries
    expect(illustrationSpec({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'lats'] }).view).toBe('front');
  });

  it('defaults to the front when nothing decides', () => {
    expect(illustrationSpec({ ...base }).view).toBe('front');
    expect(illustrationSpec({ primaryMuscles: ['shoulders'], secondaryMuscles: [] }).view).toBe('front');
    expect(illustrationSpec({ primaryMuscles: ['forearms'], secondaryMuscles: [] }).view).toBe('front');
  });
});

describe('illustrationKey', () => {
  it('is the same for the same muscles whatever the order, and differs by view, muscles or colour', () => {
    const a = illustrationSpec({ primaryMuscles: ['chest', 'shoulders'], secondaryMuscles: ['triceps'] });
    const b = illustrationSpec({ primaryMuscles: ['shoulders', 'chest'], secondaryMuscles: ['triceps'] });
    expect(illustrationKey(a, '#f25c1f')).toBe(illustrationKey(b, '#f25c1f'));
    expect(illustrationKey(a, '#f25c1f')).not.toBe(illustrationKey(a, '#112233'));
    const c = illustrationSpec({ primaryMuscles: ['chest'], secondaryMuscles: [] });
    expect(illustrationKey(a, '#f25c1f')).not.toBe(illustrationKey(c, '#f25c1f'));
  });
});
