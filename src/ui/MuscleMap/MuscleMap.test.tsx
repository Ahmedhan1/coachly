// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSCLE_GROUP_IDS, muscleGroupLabelAr, muscleLoadForExercise, type CatalogExercise } from '@/domain/exercises';
import { intensitiesFromLoad, mixHex, muscleFill } from './colors';
import { MuscleMap } from './MuscleMap';
import { VIEW_PATHS } from './shapes';

afterEach(cleanup);

describe('muscle map shapes', () => {
  it('draws every muscle group in at least one view, each at most once per view', () => {
    const drawn = new Set([...VIEW_PATHS.front, ...VIEW_PATHS.back].map(([id]) => id));
    expect([...drawn].sort()).toEqual([...MUSCLE_GROUP_IDS].sort());
    for (const view of ['front', 'back'] as const) {
      const ids = VIEW_PATHS[view].map(([id]) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('muscleFill', () => {
  it('maps intensity to a light → strong brand scale', () => {
    expect(muscleFill(undefined)).toBe('var(--muscle-off)');
    expect(muscleFill(0)).toBe('var(--muscle-off)');
    expect(muscleFill(0.2)).toBe('color-mix(in oklab, var(--muscle-hit) 40%, var(--muscle-off))');
    expect(muscleFill(0.5)).toBe('color-mix(in oklab, var(--muscle-hit) 60%, var(--muscle-off))');
    expect(muscleFill(1)).toBe('var(--muscle-hit)');
  });

  it('uses concrete colours with a palette', () => {
    const palette = { base: '#eeeeee', off: '#000000', hit: '#ff0000' };
    expect(muscleFill(0, palette)).toBe('#000000');
    expect(muscleFill(1, palette)).toBe('#ff0000');
    expect(muscleFill(0.5, palette)).toBe(mixHex('#ff0000', '#000000', 0.6));
    expect(mixHex('#ff0000', '#000000', 0.6)).toBe('#990000');
  });
});

describe('MuscleMap', () => {
  it('renders all groups as buttons with Arabic labels when interactive', () => {
    const onSelect = vi.fn();
    render(<MuscleMap view="both" onSelect={onSelect} />);
    for (const id of MUSCLE_GROUP_IDS) {
      expect(screen.getAllByRole('button', { name: muscleGroupLabelAr(id) }).length).toBeGreaterThan(0);
    }
    const chest = screen.getByRole('button', { name: muscleGroupLabelAr('chest') });
    fireEvent.click(chest);
    fireEvent.keyDown(chest, { key: 'Enter' });
    expect(onSelect).toHaveBeenNthCalledWith(1, 'chest');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('colours primary muscles stronger than secondary ones', () => {
    const exercise = {
      id: 'x',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings'],
    } as unknown as CatalogExercise;
    const { container } = render(<MuscleMap view="back" intensities={intensitiesFromLoad(muscleLoadForExercise(exercise))} />);
    const step = (id: string) => container.querySelector(`[data-muscle="${id}"]`)?.getAttribute('data-step');
    expect(step('glutes')).toBe('4');
    expect(step('hamstrings')).toBe('2');
    expect(step('lats')).toBe('0');
    expect(container.querySelector('[data-muscle="glutes"]')?.getAttribute('fill')).toBe('var(--muscle-hit)');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('img', { name: 'خريطة العضلات' })).toBeTruthy();
  });

  it('marks the selected region and renders to static markup (PDF use)', () => {
    render(<MuscleMap view="front" selected="abs" onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: muscleGroupLabelAr('abs') }).getAttribute('aria-pressed')).toBe('true');
    const html = renderToStaticMarkup(
      <MuscleMap view="front" intensities={{ chest: 1 }} palette={{ base: '#dddddd', off: '#cccccc', hit: '#f25c1f' }} />,
    );
    expect(html).toContain('fill="#f25c1f"');
    expect(html).not.toContain('var(');
  });
});
