import { useLocation, type Location } from 'react-router-dom';

/**
 * "Where the trainer came from". Links into a screen carry `state.from` (the path + query they were on), so
 * the screen's back button returns there — Home → client → program goes back to the client, then Home.
 */
export interface FromState {
  from: string;
}

export function fromOf(location: Pick<Location, 'state'>): string | null {
  const from = (location.state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') ? from : null;
}

/** The current path with its query, as a `from` value. */
export function hereOf(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}`;
}

export function useFromHere(): FromState {
  return { from: hereOf(useLocation()) };
}
