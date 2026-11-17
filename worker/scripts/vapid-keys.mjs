// Generates a VAPID key pair for Web Push (P-256), in the base64url format the Worker expects.
// Run on the owner's computer:  cd worker && npm run vapid:keys
// Then: npx wrangler secret put VAPID_PRIVATE_KEY   (paste the private line)
//       npx wrangler secret put VAPID_PUBLIC_KEY    (paste the public line)
//       npx wrangler secret put VAPID_SUBJECT       (e.g. mailto:you@example.com)
// Keep the private key out of the repo. Changing the keys later means every device must subscribe again.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify({ VAPID_PRIVATE_KEY: jwk.d, VAPID_PUBLIC_KEY: b64url(publicRaw) }));
} else {
  console.log('VAPID_PRIVATE_KEY (secret, never commit):');
  console.log(jwk.d);
  console.log('');
  console.log('VAPID_PUBLIC_KEY:');
  console.log(b64url(publicRaw));
}
