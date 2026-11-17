#!/usr/bin/env node
// Generates the Ed25519 key pair used to sign PT Coach licenses. Offline, Node 22+, no network.
// Usage: node tools/keygen.mjs [--out <folder>]
// Default folder: keys/ at the repo root (git-ignored). Better: a folder outside the repo, e.g. a USB stick.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bytesToHex, generateKeyPair } from '../shared/license.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });

if (values.help) {
  console.log('Usage: node tools/keygen.mjs [--out <folder>]');
  process.exit(0);
}

const outDir = resolve(values.out ?? join(repoRoot, 'keys'));
const privatePath = join(outDir, 'license-private-key.hex');
const publicPath = join(outDir, 'license-public-key.hex');

if (existsSync(privatePath)) {
  console.error(`STOP: ${privatePath} already exists. A new key would break every license already issued.`);
  console.error('توقف: فيه مفتاح موجود بالفعل. مفتاح جديد هيبوّظ كل التراخيص اللي اتعملت قبل كده.');
  process.exit(1);
}

const { privateKey, publicKey } = await generateKeyPair();
const privateHex = bytesToHex(privateKey);
const publicHex = bytesToHex(publicKey);

mkdirSync(outDir, { recursive: true, mode: 0o700 });
writeFileSync(privatePath, `${privateHex}\n`, { mode: 0o600, flag: 'wx' });
writeFileSync(publicPath, `${publicHex}\n`, { mode: 0o644, flag: 'wx' });

console.log(`
PUBLIC KEY (not secret / مش سر):
${publicHex}

Private key saved to / المفتاح الخاص اتحفظ في:
${privatePath}

Next steps / الخطوات الجاية (التفاصيل في docs/ACTIVATION.md):
1) Put the public key in the app and in worker/wrangler.toml (LICENSE_PUBLIC_KEY).
   حط المفتاح العام في التطبيق وفي worker/wrangler.toml.
2) cd worker && npx wrangler secret put LICENSE_PRIVATE_KEY   (paste the private key / الصق المفتاح الخاص)
3) Copy the private key file to an offline backup (USB / paper). Never commit it, never send it.
   خد نسخة من ملف المفتاح الخاص على فلاشة أو ورقة. ما تبعتهوش لحد وما ترفعهوش على GitHub.
`);
