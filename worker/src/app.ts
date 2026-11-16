import { handleAdmin, type AdminHooks } from './admin/routes';
import { handleActivate, handleStatus } from './api';
import { clientIp, corsHeaders, json, withHeaders } from './http';
import type { Deps } from './ports';
import { RULES } from './rateLimit';

/** Routes one request. All I/O goes through `deps`, so tests can swap the clock, store or limiter. */
export async function handleRequest(request: Request, deps: Deps, hooks: AdminHooks = {}): Promise<Response> {
  const url = new URL(request.url);
  const clientKey = await deps.crypto.hashClient(clientIp(request));

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return handleAdmin(request, deps, clientKey, hooks);

  if (url.pathname.startsWith('/api/')) {
    const origin = request.headers.get('Origin');
    // Browsers always send Origin on cross-origin calls; native tools (curl, the owner) send none.
    if (origin !== null && !deps.config.appOrigins.includes(origin)) return json({ error: 'forbidden' }, 403);
    const cors = origin === null ? {} : corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      if (!(await deps.localLimiter.hit(RULES.preflight, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
      return new Response(null, { status: 204, headers: cors });
    }
    let response: Response;
    if (request.method === 'POST' && url.pathname === '/api/activate') response = await handleActivate(request, deps, clientKey);
    else if (request.method === 'GET' && url.pathname === '/api/license/status') response = await handleStatus(request, deps, clientKey);
    else response = await notFound(deps, clientKey);
    return withHeaders(response, cors);
  }

  return notFound(deps, clientKey);
}

async function notFound(deps: Deps, clientKey: string): Promise<Response> {
  if (!(await deps.localLimiter.hit(RULES.other, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
  return json({ error: 'not_found' }, 404);
}
