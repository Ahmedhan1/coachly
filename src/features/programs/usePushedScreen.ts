import { useEffect } from 'react';

/**
 * Marks the document while a pushed screen with its own bottom action bar is open (program builder,
 * session), so the shared toast host sits above that bar (see Shared.module.css).
 * TODO(app shell): replace with AppShell's `pushed` match once it knows these routes.
 */
export function usePushedScreen(kind: 'bar' | 'full' = 'bar'): void {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.pushedScreen = kind;
    return () => {
      delete root.dataset.pushedScreen;
    };
  }, [kind]);
}
