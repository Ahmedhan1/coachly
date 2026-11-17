import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * Keeps the screen on while a session runs (Screen Wake Lock; re-acquired when the app comes back to the
 * foreground, since the browser drops it when hidden). Silently does nothing where unsupported.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock?.request('screen').then(
        (s) => {
          if (alive) sentinel = s;
          else void s.release().catch(() => {});
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

/** A short vibration when the rest timer runs out (Android; iOS has no vibration API and ignores it). */
export function useRestEndCue(secondsLeft: number): void {
  const prev = useRef(secondsLeft);
  useEffect(() => {
    if (prev.current > 0 && secondsLeft === 0) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* unsupported */
      }
    }
    prev.current = secondsLeft;
  }, [secondsLeft]);
}
