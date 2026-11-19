import type { ComponentType } from 'react';

/** Lazy-loads a named screen export so every feature is its own chunk. */
export const screen = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) => ({
  lazy: async () => ({ Component: (await load())[name] as ComponentType }),
});
