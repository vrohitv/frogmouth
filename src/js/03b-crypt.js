import { bus } from './00-util.js';
import { Store } from './03-store.js';

/* ── crypt: an optional passphrase for secret values ─────────────────
   With a passphrase, each secret's value is stored encrypted (secret.enc) and its
   plain `value` is empty; keys, tags and notes stay readable, so search still works.
   The passphrase becomes a key with PBKDF2-SHA256 (data.crypt holds the salt and the
   rounds), and each value is sealed with AES-GCM under its own random 12-byte IV.
   The key and the plain values live only in memory while unlocked, never in the data,
   so a save always writes ciphertext. It locks when the vault closes or is read again,
   on Lock, and after 15 minutes without a key or a click. The browser's own WebCrypto
   does the work: nothing to download, nothing sent anywhere. */
export const Crypt = (() => {
  const ROUNDS = 600000, CHECK = 'frogmouth', IDLE = 15 * 60e3;
  let key = null, last = Date.now();
  const plain = new Map(); // secret id -> value, while unlocked

  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function derive(pass, salt, rounds) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(k, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(text)));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64(out);
  }
  async function unseal(k, s) {
    const all = unb64(s);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, k, all.slice(12)));
  }

  const on = () => !!(Store.S.data && Store.S.data.crypt);
  const locked = () => on() && !key;
  /* a value as it reads now: null while locked */
  const value = (x) => (x.enc ? (plain.has(x.id) ? plain.get(x.id) : null) : x.value);
  /* set a value, encrypting it when the vault has a passphrase (unlock first) */
  async function setValue(x, v) {
    if (!on()) { x.value = v; delete x.enc; return; }
    if (!key) throw new Error('Unlock the secrets first');
    x.enc = await seal(key, v); x.value = ''; plain.set(x.id, v);
  }

  async function protect(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), k = await derive(pass, salt, ROUNDS);
    const d = Store.S.data;
    for (const x of d.secrets) { plain.set(x.id, x.value); x.enc = await seal(k, x.value); x.value = ''; }
    d.crypt = { v: 1, kdf: 'PBKDF2-SHA256', iter: ROUNDS, salt: b64(salt), check: await seal(k, CHECK) };
    key = k; last = Date.now();
    Store.change('secrets');
  }
  /* true when the passphrase is right; then every value can be read */
  async function unlock(pass) {
    const c = Store.S.data && Store.S.data.crypt; if (!c) return true;
    let k;
    try { k = await derive(pass, unb64(c.salt), +c.iter || ROUNDS); if ((await unseal(k, c.check)) !== CHECK) return false; } catch { return false; }
    plain.clear();
    for (const x of Store.S.data.secrets) if (x.enc) { try { plain.set(x.id, await unseal(k, x.enc)); } catch { /* left unreadable */ } }
    key = k; last = Date.now();
    bus.emit('unlocked');
    return true;
  }
  function lock() {
    const was = !!key;
    key = null; plain.clear();
    if (was) bus.emit('locked');
  }
  /* back to plain values (unlock first) */
  async function unprotect() {
    if (!on()) return;
    if (!key) throw new Error('Unlock the secrets first');
    for (const x of Store.S.data.secrets) { if (x.enc) x.value = plain.has(x.id) ? plain.get(x.id) : ''; delete x.enc; }
    delete Store.S.data.crypt;
    lock();
    Store.change('secrets');
  }

  // a closed or reloaded vault starts locked; so does one left alone for a while
  bus.on('closed', lock);
  bus.on('loaded', lock);
  for (const t of ['keydown', 'pointerdown']) addEventListener(t, () => { last = Date.now(); }, true);
  setInterval(() => { if (key && Date.now() - last > IDLE) lock(); }, 30e3);

  return { on, locked, value, setValue, protect, unlock, lock, unprotect };
})();
