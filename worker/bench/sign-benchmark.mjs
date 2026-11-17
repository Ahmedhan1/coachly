// Measures the Ed25519 work the Worker does per request, in Node 22 (same V8 engine as Workers).
// Run: npm run bench   (performance.now() is frozen inside workerd, so this cannot run in the Workers pool.)
import { deviceFingerprint, hexToBytes, precomputeSigningTables, publicKeyFromPrivate, signLicense, verifyLicenseToken } from '../../shared/license.ts';

const key = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const payload = { v: 1, lid: crypto.randomUUID(), dev: await deviceFingerprint('bench'), name: 'كابتن', iat: 1, actBy: 2, exp: null, feat: ['core'] };

let t = performance.now();
precomputeSigningTables();
const startup = performance.now() - t;

t = performance.now();
const token = await signLicense(payload, key);
const firstSign = performance.now() - t;

const N = 300;
t = performance.now();
for (let i = 0; i < N; i++) await signLicense({ ...payload, iat: i }, key);
const sign = (performance.now() - t) / N;

const pub = await publicKeyFromPrivate(key);
t = performance.now();
for (let i = 0; i < N; i++) await verifyLicenseToken(token, pub);
const verify = (performance.now() - t) / N;

console.log(`startup precompute (global scope, once): ${startup.toFixed(2)} ms`);
console.log(`first sign after precompute:             ${firstSign.toFixed(2)} ms`);
console.log(`sign, warm (POST /api/activate):          ${sign.toFixed(3)} ms`);
console.log(`verify, warm (GET /api/license/status):   ${verify.toFixed(3)} ms`);
console.log('Free-tier budget: 10 ms CPU per request.');
