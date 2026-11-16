#!/usr/bin/env node
// Offline fallback when Cloudflare is down: prints a signed "PT1." long code for one device.
// Usage:
//   node tools/sign-offline-code.mjs --device <device id from the app> --name "<customer>" --duration <lifetime|days>
//        [--window <activation days, default 14>] [--key <private key file, default keys/license-private-key.hex>]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  deviceFingerprint,
  hexToBytes,
  normalizeDeviceId,
  publicKeyFromPrivate,
  signLicense,
  verifyLicenseToken,
  wrapOfflineCode,
} from '../shared/license.ts';

const DAY = 86_400;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(english, arabic) {
  console.error(`ERROR: ${english}\nخطأ: ${arabic}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    device: { type: 'string' },
    name: { type: 'string' },
    duration: { type: 'string' },
    window: { type: 'string', default: '14' },
    key: { type: 'string' },
    now: { type: 'string' }, // unix seconds, for tests only
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log('node tools/sign-offline-code.mjs --device <id> --name "<name>" --duration <lifetime|days> [--window 14] [--key <file>]');
  process.exit(0);
}

const deviceId = normalizeDeviceId(values.device ?? '');
if (!/^[a-z0-9-]{8,128}$/.test(deviceId)) fail('--device is missing or not a device id', 'اكتب رقم الجهاز اللي ظاهر في التطبيق بعد --device');

const name = (values.name ?? '').trim();
if (name === '' || name.length > 100) fail('--name is required (max 100 chars)', 'اكتب اسم العميل بعد --name');

let exp = null;
const now = values.now === undefined ? Math.floor(Date.now() / 1000) : Number(values.now);
if (values.duration !== 'lifetime') {
  const days = Number(values.duration);
  if (!Number.isInteger(days) || days < 1 || days > 3650) fail('--duration must be "lifetime" or a number of days', 'المدة لازم تكون lifetime أو عدد أيام');
  exp = now + days * DAY;
}

const windowDays = Number(values.window);
if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) fail('--window must be 1..365 days', 'مهلة التفعيل من 1 لـ 365 يوم');

const keyPath = resolve(values.key ?? join(repoRoot, 'keys', 'license-private-key.hex'));
let privateKey;
try {
  privateKey = hexToBytes(readFileSync(keyPath, 'utf8').trim());
} catch {
  fail(`cannot read the private key at ${keyPath}`, 'مش لاقي ملف المفتاح الخاص. استخدم --key وحط مكان الملف');
}
if (privateKey === null || privateKey.length !== 32) fail('the private key file is not 64 hex characters', 'ملف المفتاح الخاص بايظ');

const payload = {
  v: 1,
  lid: `off-${crypto.randomUUID()}`,
  dev: await deviceFingerprint(deviceId),
  name,
  iat: now,
  actBy: now + windowDays * DAY,
  exp,
  feat: ['core'],
};
const token = await signLicense(payload, privateKey);
const check = await verifyLicenseToken(token, await publicKeyFromPrivate(privateKey));
if (!check.ok) fail('self-check failed', 'الكود اللي اتعمل فشل في التحقق');

const code = wrapOfflineCode(token);
console.error(`License id: ${payload.lid}`);
console.error(`Expires / ينتهي: ${exp === null ? 'lifetime / مدى الحياة' : new Date(exp * 1000).toISOString().slice(0, 10)}`);
console.error(`Activate before / يتفعّل قبل: ${new Date(payload.actBy * 1000).toISOString().slice(0, 10)}`);
console.error('Send the next line to the trainer / ابعت السطر اللي جاي للمدرب:');
console.log(code);
