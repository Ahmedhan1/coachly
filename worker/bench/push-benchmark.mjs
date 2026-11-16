// Measures the CPU cost of one Web Push send (RFC 8291 encryption + VAPID ES256 signature) in Node 22
// (same V8; Node's Web Crypto uses OpenSSL, workerd uses BoringSSL). performance.now() is frozen inside
// workerd, so this cannot run in the Workers pool. Run: npm run bench:push
import { importVapidKeys, signVapidJwt } from '../src/push/vapid.ts';
import { encryptPushPayload } from '../src/push/webpush.ts';

const b = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
// RFC 8291 Appendix A user-agent keys; a test-only VAPID pair (worker/test/fixtures.ts).
const keys = { p256dh: b('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), auth: b('BTBZMqHH6r4Tts7J_aSIgg') };
const vapid = await importVapidKeys(
  'RVN97ZGt23rXHSVkQ4ncT_uNTDMwCQxBOEK52YqCUCk',
  'BEn8vbGWpoCUuvmo-UnEMflbaJL3UkagEmqVC7q3HqYPPuUZ6p8gn5gBcqF7Kcjy-fGTjBBg-EgB0ntr63-QXbs',
  'mailto:owner@example.com',
);
const payload = new TextEncoder().encode(JSON.stringify({ v: 1, id: 'abc123', title: 'تذكير بالحصة', body: 'عندك حصة بعد 30 دقيقة' }));

async function time(label, n, fn) {
  for (let i = 0; i < 20; i++) await fn(i); // warm-up
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) await fn(i);
  const wall = (performance.now() - t0) / n;
  const c = process.cpuUsage(cpu0);
  const cpu = (c.user + c.system) / 1000 / n;
  console.log(`${label.padEnd(44)} wall ${wall.toFixed(3)} ms   cpu ${cpu.toFixed(3)} ms`);
  return Math.max(wall, cpu);
}

const N = 500;
const enc = await time('encrypt payload (ECDH keygen+derive, HKDF, GCM)', N, () => encryptPushPayload(payload, keys));
const sig = await time('VAPID JWT (ES256 sign)', N, (i) => signVapidJwt(vapid, 'https://web.push.apple.com', 1_790_000_000 + i));
const both = await time('one push without JWT cache (encrypt + sign)', N, async (i) => {
  await encryptPushPayload(payload, keys);
  await signVapidJwt(vapid, 'https://web.push.apple.com', 1_790_000_000 + i);
});
console.log('');
console.log(`Cron signs one JWT per push service per run, so a batch of N costs ~ N x ${enc.toFixed(3)} + ${sig.toFixed(3)} ms.`);
for (const n of [10, 20, 40]) console.log(`  batch ${String(n).padStart(2)}: ~${(n * enc + sig).toFixed(2)} ms crypto  (worst case without cache: ${(n * both).toFixed(2)} ms)`);
console.log('Free-tier budget: 10 ms CPU per cron invocation.');
console.log('Node figures include libuv thread-pool overhead per Web Crypto call. Measured inside workerd (Workers');
console.log('pool, clock advanced by a D1 round trip around 1000 iterations): encrypt ~0.17 ms, sign ~0.035 ms.');
