/**
 * The production account/cloud Worker. NOT a secret. Committed so that no build can ever ship without a
 * server address (an earlier build without VITE_WORKER_URL could not reach the server at all). VITE_WORKER_URL still overrides it, e.g. for a staging Worker.
 *
 * Never change this for an existing install base: trainers' apps talk to this address forever.
 */
export const DEFAULT_WORKER_URL = 'https://coachly-api.nexus-ahmed.workers.dev';

/**
 * Picks the build-time override when it is a proper https URL (or a local `wrangler dev` on http://localhost /
 * 127.0.0.1), otherwise the committed default.
 */
export function resolveWorkerUrl(override: string | undefined): string {
  const value = override?.trim();
  const ok = value && (/^https:\/\/[^\s/]+/.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(value));
  return ok ? value.replace(/\/+$/, '') : DEFAULT_WORKER_URL;
}
