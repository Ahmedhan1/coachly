import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hereOf } from '@/ui';

/**
 * navigate() that remembers the current screen as `state.from`, so the next screen's back button returns
 * here (see PageHeader). Use it for every "open this client / program / exercise" tap.
 */
export function useGo(): (to: string, options?: { replace?: boolean }) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const here = hereOf(location);
  return useCallback((to: string, options?: { replace?: boolean }) => navigate(to, { state: { from: here }, replace: options?.replace }), [navigate, here]);
}
