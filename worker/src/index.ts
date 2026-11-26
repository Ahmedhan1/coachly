import { handleRequest } from './app';
import { depsFromEnv } from './deps';
import type { Env } from './env';
import { json } from './http';
import { runPushCron } from './push/cron';
import { MemoryRateLimiter } from './rateLimit';

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
    try {
      return await handleRequest(request, deps, { prune: (now) => d1Limiter.prune(now - 2 * 86_400) });
    } catch {
      // Last resort for /admin and /c/ (API errors are already answered inside handleRequest, with CORS).
      return json({ error: 'server_error' }, 500);
    }
  },

  /** Cron (wrangler.toml [triggers]): sends due push notifications, one bounded batch per run. */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    let built: Awaited<ReturnType<typeof depsFromEnv>>;
    try {
      built = await depsFromEnv(env, { memoryLimiter });
    } catch {
      return;
    }
    const now = Math.floor(controller.scheduledTime / 1000);
    const report = await runPushCron(built.deps.cloud, now);
    // Housekeeping once an hour (one D1 query): drop rate-limit windows older than two days.
    if (now % 3600 < 300) await built.d1Limiter.prune(now - 2 * 86_400);
    // Counts only: never titles, bodies, endpoints or ids.
    console.log(JSON.stringify({ cron: 'push', ...report }));
  },
} satisfies ExportedHandler<Env>;
