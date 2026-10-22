/* ── reading vaults encrypted by earlier builds ─────────────────────
   frogmouth no longer encrypts vaults. Builds before 1.0.0 could
   (AES-256-GCM, key from PBKDF2-SHA256); this opens such a file once so
   it can be saved back as plain JSON. Throws on a wrong passphrase. */
export async function decryptLegacy(pass, env) {
  const te = new TextEncoder();
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(env.kdf.salt), iterations: env.kdf.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv) }, key, unb64(env.data));
  return new TextDecoder().decode(plain);
}
