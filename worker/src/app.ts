import { handleAdmin, type AdminHooks } from './admin/routes';
import { handleActivate, handleStatus } from './api';
import { routeBackup } from './backup/routes';
import { clientIp, corsHeaders, json, withHeaders } from './http';
import type { Deps } from './ports';
import { routePush } from './push/routes';
import { RULES } from './rateLimit';
import { viewerHeaders, viewerHtml } from './share/page';
import { routeShare, SHARE_ID } from './share/routes';

/** Routes one request. All I/O goes through `deps`, so tests can swap the clock, store or limiter. */
export async function handleRequest(request: Request, deps: Deps, hooks: AdminHooks = {}): Promise<Response> {
  const url = new URL(request.url);
  const clientKey = await deps.crypto.hashClient(clientIp(request));

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return handleAdmin(request, deps, clientKey, hooks);

  const viewer = /^\/c\/([^/]+)$/.exec(url.pathname);
  if (viewer !== null && request.method === 'GET' && !deps.cloud.bucket) return json({ error: 'storage_unavailable' }, 503);
  if (viewer !== null && request.method === 'GET') return viewerPage(deps, clientKey, viewer[1] ?? '');

  if (url.pathname.startsWith('/api/')) {
    const origin = request.headers.get('Origin');
    // Browsers always send Origin on cross-origin calls; native tools (curl, the owner) send none.
    // The Worker's own origin is the client page (/c/...) calling its share endpoints.
    const allowed = origin === null || origin === url.origin || deps.config.appOrigins.includes(origin);
    if (!allowed) return json({ error: 'forbidden' }, 403);
    const cors = origin === null || origin === url.origin ? {} : corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      if (!(await deps.localLimiter.hit(RULES.preflight, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
      return new Response(null, { status: 204, headers: cors });
    }
    const response = await routeApi(request, url.pathname, deps, clientKey);
    return withHeaders(response, cors);
  }

  return notFound(deps, clientKey);
}

async function routeApi(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response> {
  if (request.method === 'POST' && path === '/api/activate') return handleActivate(request, deps, clientKey);
  if (request.method === 'GET' && path === '/api/license/status') return handleStatus(request, deps, clientKey);
  const storage = path === '/api/backup' || path.startsWith('/api/backup/') || path === '/api/checkins' || path.startsWith('/api/share/');
  // R2 not bound yet (owner has not enabled R2): those features answer 503 and the app keeps its local copy.
  if (storage && !deps.cloud.bucket) return json({ error: 'storage_unavailable' }, 503);
  if (path === '/api/backup' || path.startsWith('/api/backup/')) return (await routeBackup(request, path, deps, clientKey)) ?? notFound(deps, clientKey);
  if (path === '/api/push' || path.startsWith('/api/push/')) return (await routePush(request, path, deps, clientKey)) ?? notFound(deps, clientKey);
  if (path === '/api/checkins' || path.startsWith('/api/share/')) return (await routeShare(request, path, deps, clientKey)) ?? notFound(deps, clientKey);
  return notFound(deps, clientKey);
}

function randomNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

async function viewerPage(deps: Deps, clientKey: string, shareId: string): Promise<Response> {
  if (!(await deps.localLimiter.hit(RULES.viewerPage, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
  if (!SHARE_ID.test(shareId)) return notFound(deps, clientKey);
  const appOrigin = deps.config.appOrigins[0] ?? null;
  const nonce = randomNonce();
  const html = viewerHtml({ nonce, shareId, imageBase: appOrigin === null ? '' : `${appOrigin}/exercise-pack/img/` });
  return new Response(html, { headers: viewerHeaders(nonce, appOrigin) });
}

async function notFound(deps: Deps, clientKey: string): Promise<Response> {
  if (!(await deps.localLimiter.hit(RULES.other, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
  return json({ error: 'not_found' }, 404);
}
