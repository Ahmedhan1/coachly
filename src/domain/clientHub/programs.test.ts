import { describe, expect, it } from 'vitest';
import { parseActivePrograms, setActiveProgram, splitClientPrograms } from './programs';

const p = (id: string, over: Partial<{ clientId: string | null; isTemplate: boolean; createdAt: number; updatedAt: number }> = {}) => ({
  id,
  clientId: 'c1' as string | null,
  isTemplate: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('splitClientPrograms', () => {
  it('uses the explicitly chosen program as active and lists the rest as history, newest first', () => {
    const r = splitClientPrograms([p('a', { updatedAt: 5 }), p('b', { updatedAt: 9 }), p('c', { updatedAt: 7 })], 'c1', 'a');
    expect(r.active?.id).toBe('a');
    expect(r.past.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('falls back to the newest created program when nothing (valid) was chosen', () => {
    const r = splitClientPrograms([p('old', { createdAt: 1 }), p('new', { createdAt: 3 })], 'c1', 'deleted');
    expect(r.active?.id).toBe('new');
    expect(r.past.map((x) => x.id)).toEqual(['old']);
  });
  it('ignores templates and other clients’ programs', () => {
    const r = splitClientPrograms([p('t', { isTemplate: true, createdAt: 9 }), p('x', { clientId: 'c2' }), p('mine')], 'c1', undefined);
    expect(r.active?.id).toBe('mine');
    expect(r.past).toEqual([]);
  });
  it('returns no active program for a client without programs', () => {
    expect(splitClientPrograms([], 'c1', undefined)).toEqual({ active: null, past: [] });
  });
});

describe('active program map', () => {
  it('parses safely and sets/clears entries without mutating', () => {
    expect(parseActivePrograms('bad')).toEqual({});
    expect(parseActivePrograms({ c1: 'p1', c2: 3 })).toEqual({});
    const map = parseActivePrograms({ c1: 'p1' });
    const next = setActiveProgram(map, 'c2', 'p2');
    expect(next).toEqual({ c1: 'p1', c2: 'p2' });
    expect(map).toEqual({ c1: 'p1' });
    expect(setActiveProgram(next, 'c1', null)).toEqual({ c2: 'p2' });
  });
});
