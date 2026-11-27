#!/usr/bin/env node
// One-step production deploy (Cloudflare free plan):
//   1. `npm run check` and the Worker tests (refuses to deploy on any failure),
//   2. production build of the app, with a guard that it points at the account Worker,
//   3. D1 migrations, then the account Worker (`worker/`),
//   4. the app Worker (`deploy/app/`), then the app files into its D1 store: a fresh random upload key is set as the
//      Worker secret for every deploy (never stored anywhere), and deploy/app/upload.py sends only changed files.
// Needs CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID when the token sees several accounts), or `wrangler login`.
// Flags: --skip-checks (only after the checks just passed), --app-only, --worker-only.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const wrangler = join(root, 'worker/node_modules/.bin/wrangler');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
// CI passes unset repository secrets as empty strings: an empty account id must mean "not set" for wrangler.
if (!env.CLOUDFLARE_ACCOUNT_ID) delete env.CLOUDFLARE_ACCOUNT_ID;
if (!env.CLOUDFLARE_API_TOKEN && process.env.CI) throw new Error('CLOUDFLARE_API_TOKEN is not set (add it as a repository secret)');

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
  if (!bundle.includes('api.getcoachly.')) throw new Error('refusing to deploy: dist/ does not point at the account Worker');
  if (!readFileSync(join(root, 'dist/_headers'), 'utf8').includes('Content-Security-Policy')) throw new Error('refusing to deploy: dist/_headers has no CSP');
}

if (!args.has('--app-only')) {
  run(wrangler, ['d1', 'migrations', 'apply', 'pt-coach-licenses', '--remote'], join(root, 'worker'));
  run(wrangler, ['deploy'], join(root, 'worker'));
}

if (!args.has('--worker-only')) {
  const appDir = join(root, 'deploy/app');
  run(wrangler, ['deploy'], appDir);
  const uploadKey = randomBytes(32).toString('hex');
  console.log('\n▶ wrangler secret put UPLOAD_KEY (fresh random key for this deploy)');
  execFileSync(wrangler, ['secret', 'put', 'UPLOAD_KEY'], { cwd: appDir, input: uploadKey, stdio: ['pipe', 'inherit', 'inherit'], env });
  console.log('\n▶ python3 deploy/app/upload.py (changed files only; entry files last)');
  execFileSync('python3', [join(appDir, 'upload.py')], { cwd: root, stdio: 'inherit', env: { ...env, UPLOAD_KEY: uploadKey } });
}

if (!args.has('--worker-only')) {
  // Smoke check: the home-screen logo needs the app Worker on /api/brand and /b/*. An assets-only deploy answers
  // 405 / index.html there, and the install page could never set a logo (seen in production, 27 Nov 2026).
  const app = 'https://app.getcoachly.workers.dev';
  const probe = (args) => {
    try {
      return execFileSync('curl', ['-s', '-m', '20', ...args], { encoding: 'utf8', env });
    } catch {
      return null;
    }
  };
  const upload = probe(['-X', 'POST', '-H', 'Content-Type: application/json', '-H', `Origin: ${app}`, '-d', '{}', '-w', '\n%{http_code}', `${app}/api/brand`]);
  const brand = probe(['-o', '/dev/null', '-w', '%{http_code}', `${app}/b/000000000000000000000000/brand.json`]);
  if (upload === null || brand === null) console.warn('\n⚠ could not reach the app to check the logo routes; check /api/brand by hand');
  else if (!upload.trim().endsWith('400') || !upload.includes('"error"') || brand.trim() !== '404') {
    throw new Error(`the app Worker does not serve /api/brand and /b/* (got ${upload.trim().split('\n').pop()} and ${brand.trim()}): trainers cannot put their logo on the icon`);
  } else console.log('\n✔ logo routes answer from the app Worker');
}

console.log('\n✔ deployed: https://app.getcoachly.workers.dev  (account Worker: https://api.getcoachly.workers.dev)');
