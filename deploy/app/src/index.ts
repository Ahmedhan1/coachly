/**
 * The installed PWA (`pt-coach.<account>.workers.dev`). Its files are Workers Static Assets: Cloudflare serves them
 * from its edge cache without running this Worker at all (free, unlimited, fastest), with the security headers and
 * cache rules from `dist/_headers` (generated from shared/appHeaders.ts at build).
 *
 * This Worker only runs for the routes listed in wrangler.toml `run_worker_first`: the branded home-screen icons
 * (`/api/brand`, `/b/<id>/<file>`, stored in D1). Anything else falls through to the static files.
 */
import { APP_SECURITY_HEADERS } from '../../../shared/appHeaders';
import { brandRoute } from './brand';

export interface Env {
  /** D1 `pt-coach-app`: brand icon sets (brands, brand_assets, brand_rate). */
  APP: D1Database;
  /** The built app (wrangler.toml [assets]). */
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const brand = await brandRoute(request, env, url, ctx, APP_SECURITY_HEADERS);
    return brand ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
