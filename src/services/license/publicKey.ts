import { hexToBytes, KEY_LENGTH } from '../../../shared/license';

/**
 * Ed25519 public key that verifies license tokens (64 hex chars). NOT a secret.
 * The owner pastes the PUBLIC KEY printed by `node tools/keygen.mjs` here (docs/ACTIVATION.md, step 1).
 * While it is the placeholder, every real code is rejected; dev and build print a loud warning.
 */
export const LICENSE_PUBLIC_KEY_HEX: string = 'f7b05d930a69c89ddaec69450fbf3e2d03934f222507e3a2d03256def880e301';

let warned = false;

/** Decoded key, or null while the placeholder (or a malformed value) is committed. */
export function parsePublicKey(hex: string): Uint8Array | null {
  const bytes = hexToBytes(hex.trim());
  return bytes && bytes.length === KEY_LENGTH ? bytes : null;
}

export function embeddedPublicKey(): Uint8Array | null {
  const key = parsePublicKey(LICENSE_PUBLIC_KEY_HEX);
  if (!key && !warned) {
    warned = true;
    console.error(
      '[license] LICENSE_PUBLIC_KEY_HEX is not set (src/services/license/publicKey.ts). ' +
        'No activation code can be verified. See docs/ACTIVATION.md step 1.',
    );
  }
  return key;
}
