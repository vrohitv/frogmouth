/* ── optional vault encryption (AES-256-GCM, PBKDF2-SHA256) ───── */
const Vcrypt = (() => {
  const ITER = 600000;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = (buf) => {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function derive(pass, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  return {
    available: () => !!(window.crypto && crypto.subtle),
    /* create a fresh key for a new passphrase */
    async create(pass) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      return { key: await derive(pass, salt, ITER), salt, iterations: ITER };
    },
    async seal(c, plaintext) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, c.key, te.encode(plaintext));
      return {
        frogmouth: 1,
        encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: c.iterations, salt: b64(c.salt) },
        cipher: { name: 'AES-GCM', iv: b64(iv) },
        data: b64(ct),
      };
    },
    /* throws on a wrong passphrase */
    async open(pass, env) {
      const salt = unb64(env.kdf.salt);
      const c = { key: await derive(pass, salt, env.kdf.iterations), salt, iterations: env.kdf.iterations };
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv) }, c.key, unb64(env.data));
      return { c, text: td.decode(pt) };
    },
    /* decrypt with an already-derived key (same salt), e.g. after a disk reload */
    async openWithKey(c, env) {
      if (env.kdf.salt !== b64(c.salt)) throw new Error('locked');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv) }, c.key, unb64(env.data));
      return { c, text: td.decode(pt) };
    },
  };
})();
