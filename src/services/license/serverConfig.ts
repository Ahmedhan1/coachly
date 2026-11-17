/**
 * The production license/cloud Worker. NOT a secret. Committed so that no build can ever ship without a
 * server address (an earlier build without VITE_WORKER_URL made every short code fail with "server not
 * responding"). VITE_WORKER_URL still overrides it, e.g. for a staging Worker.
 *
 * Never change this for an existing install base: trainers' apps talk to this address forever.
 */
export const DEFAULT_WORKER_URL = 'https://pt-coach-license.nexus-ahmed.workers.dev';

/** Picks the build-time override when it is a proper https URL, otherwise the committed default. */
export function resolveWorkerUrl(override: string | undefined): string {
  const value = override?.trim();
  return value && /^https:\/\/[^\s/]+/.test(value) ? value.replace(/\/+$/, '') : DEFAULT_WORKER_URL;
}
