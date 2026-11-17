import { describe, expect, it } from 'vitest';
import { canSkipInstallGate, isStandaloneDisplay, type StandaloneEnv } from './standalone';

function env(over: Partial<StandaloneEnv> = {}): StandaloneEnv {
  const store = new Map<string, string>();
  return {
    matchMedia: () => ({ matches: false }),
    navigator: {},
    search: '',
    session: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    ...over,
  };
}

describe('install gate', () => {
  it('detects iOS standalone and display-mode standalone', () => {
    expect(isStandaloneDisplay(env({ navigator: { standalone: true } }))).toBe(true);
    expect(isStandaloneDisplay(env({ matchMedia: () => ({ matches: true }) }))).toBe(true);
    expect(isStandaloneDisplay(env())).toBe(false);
  });
  it('blocks a normal browser tab', () => {
    expect(canSkipInstallGate(env(), true)).toBe(false);
  });
  it('honours ?standalone=1 only when the build allows it, and remembers it', () => {
    const e = env({ search: '?standalone=1' });
    expect(canSkipInstallGate(e, false)).toBe(false);
    expect(canSkipInstallGate(e, true)).toBe(true);
    expect(canSkipInstallGate({ ...e, search: '' }, true)).toBe(true);
  });
});
