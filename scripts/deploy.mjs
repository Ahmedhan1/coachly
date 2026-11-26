#!/usr/bin/env node
// One-step production deploy (Cloudflare free plan):
//   1. `npm run check` and the Worker tests (refuses to deploy on any failure),
//   2. production build of the app, with a guard that it points at the account Worker,
//   3. D1 migrations, then the account Worker (`worker/`),
//   4. the app Worker with its static files (`deploy/app/`, Workers Static Assets: only changed files upload).
// Needs CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID when the token sees several accounts), or `wrangler login`.
// Flags: --skip-checks (only after the checks just passed), --app-only, --worker-only.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const wrangler = join(root, 'worker/node_modules/.bin/wrangler');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

function run(cmd, cmdArgs, cwd = root) {
  console.log(`\n▶ ${cmd} ${cmdArgs.join(' ')}  (${cwd.replace(root, '.') || '.'})`);
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit', env });
}

if (!args.has('--skip-checks')) {
  run('npm', ['run', 'check']);
  run('npm', ['test'], join(root, 'worker'));
}

if (!args.has('--worker-only')) {
  run('npm', ['run', 'build']);
  // Release guard: a build without the account server address can never sign anyone in.
  const assets = join(root, 'dist/assets');
  const bundle = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
  if (!bundle.includes('pt-coach-license.')) throw new Error('refusing to deploy: dist/ does not point at the account Worker');
  if (!readFileSync(join(root, 'dist/_headers'), 'utf8').includes('Content-Security-Policy')) throw new Error('refusing to deploy: dist/_headers has no CSP');
}

if (!args.has('--app-only')) {
  run(wrangler, ['d1', 'migrations', 'apply', 'pt-coach-licenses', '--remote'], join(root, 'worker'));
  run(wrangler, ['deploy'], join(root, 'worker'));
}

if (!args.has('--worker-only')) run(wrangler, ['deploy'], join(root, 'deploy/app'));

console.log('\n✔ deployed: https://pt-coach.nexus-ahmed.workers.dev  (account Worker: https://pt-coach-license.nexus-ahmed.workers.dev)');
