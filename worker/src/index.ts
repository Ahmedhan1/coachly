import { precomputeSigningTables } from '../../shared/license';
import { handleRequest } from './app';
import { depsFromEnv } from './deps';
import type { Env } from './env';
import { json } from './http';
import { MemoryRateLimiter } from './rateLimit';

// Build the Ed25519 base-point table at startup (global scope, outside the per-request CPU budget).
// Measured in Node 22 (`npm run bench`): 25-55 ms once here; then the first signature ~3-4 ms and warm ones
// ~1 ms, versus ~40 ms for the first signature without it. Warm verify (status endpoint) ~2-3 ms.
precomputeSigningTables();

const memoryLimiter = new MemoryRateLimiter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let built: Awaited<ReturnType<typeof depsFromEnv>>;
    try {
      built = await depsFromEnv(env, { memoryLimiter });
    } catch {
      // Missing or malformed secrets. Never echo details: they may describe the secrets.
      return json({ error: 'server_not_configured' }, 503);
    }
    const { deps, d1Limiter } = built;
    return handleRequest(request, deps, { prune: (now) => d1Limiter.prune(now - 2 * 86_400) });
  },
} satisfies ExportedHandler<Env>;
