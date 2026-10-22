/* ── tiny helpers ─────────────────────────────────────────────── */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
/* ── platform keys ────────────────────────────────────────────────
   macOS uses ⌘ as the main modifier; Windows and Linux use Ctrl. Shortcuts
   are written once as 'mod+shift+p' and shown in the platform's own style:
   ⌘⇧P on a Mac, Ctrl+Shift+P elsewhere. */
const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
export const isMac = /mac|iphone|ipad|ipod/i.test(platform);
export const modKey = (e) => (isMac ? e.metaKey : e.ctrlKey);
/* AltGr on Windows/Linux reports as Ctrl+Alt; it types characters (@, €, …), never shortcuts */
export const isAltGr = (e) => !isMac && !!(e.getModifierState && e.getModifierState('AltGraph'));
const KEYS = {
  mac: { mod: '⌘', alt: '⌥', shift: '⇧', ctrl: '⌃', enter: '↵', backspace: '⌫', del: 'Del', esc: 'Esc', tab: 'Tab', space: 'Space' },
  pc: { mod: 'Ctrl', alt: 'Alt', shift: 'Shift', ctrl: 'Ctrl', enter: 'Enter', backspace: 'Backspace', del: 'Del', esc: 'Esc', tab: 'Tab', space: 'Space' },
};
const MODS = new Set(['mod', 'alt', 'shift', 'ctrl']);
export function kbFor(mac, spec) {
  const names = mac ? KEYS.mac : KEYS.pc;
  return String(spec).split(' / ').map((combo) => {
    const parts = combo.split('+').map((t) => t.trim()).filter(Boolean);
    const label = parts.map((t) => names[t.toLowerCase()] || (t.length === 1 ? t.toUpperCase() : t));
    if (!mac) return label.join('+');
    const nMods = parts.filter((t) => MODS.has(t.toLowerCase())).length;
    const mods = label.slice(0, nMods).join(''), rest = label.slice(nMods).join('+');
    return rest.length > 1 && /^[a-z]/i.test(rest) ? (mods ? `${mods} ${rest}` : rest) : mods + rest;
  }).join(' / ');
}
/* kb('mod+shift+p') → '⌘⇧P' on a Mac, 'Ctrl+Shift+P' on Windows and Linux */
export const kb = (spec) => kbFor(isMac, spec);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now = () => Date.now();

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'data') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k);
  return el;
}

export function uid() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return now().toString(36) + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export function relTime(ts) {
  if (!ts) return '';
  const s = (now() - ts) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

export function isTypingTarget(t) {
  if (!t || t.nodeType !== 1) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/* ── event bus ────────────────────────────────────────────────── */
export const bus = (() => {
  const m = new Map();
  return {
    on(n, f) { (m.get(n) || m.set(n, []).get(n)).push(f); },
    emit(n, ...a) { (m.get(n) || []).forEach((f) => f(...a)); },
  };
})();

/* ── fuzzy matching ───────────────────────────────────────────────
   Returns {s: score, p: [positions]} or null. q and t are lowercase. */
const WORD_EDGE = /[\s_\-./:@$#()[\]]/;
export function fuzzy(q, t) {
  if (!q) return { s: 0, p: [] };
  const i = t.indexOf(q);
  if (i >= 0) {
    const p = [];
    for (let k = 0; k < q.length; k++) p.push(i + k);
    const edge = i === 0 || WORD_EDGE.test(t[i - 1]);
    return { s: 100 + (edge ? 40 : 0) - i * 0.3 - t.length * 0.02, p };
  }
  let ti = 0, last = -1, s = 0;
  const p = [];
  for (let k = 0; k < q.length; k++) {
    const ch = q[k];
    if (ch === ' ') continue;
    ti = t.indexOf(ch, ti);
    if (ti < 0) return null;
    if (ti === last + 1) s += 6;
    else if (ti === 0 || WORD_EDGE.test(t[ti - 1])) s += 4;
    else s -= Math.min(ti - last, 12) * 0.6;
    p.push(ti);
    last = ti++;
  }
  return { s: s - t.length * 0.02, p };
}

export function markPositions(text, positions) {
  if (!positions || !positions.length) return esc(text);
  const set = new Set(positions);
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);
    if (on && !open) { out += '<mark>'; open = true; }
    if (!on && open) { out += '</mark>'; open = false; }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}

/* ── toasts ───────────────────────────────────────────────────── */
export function toast(msg, opts = {}) {
  const host = $('#toasts');
  if (!host) return;
  const el = h('div', { class: 'toast' + (opts.kind ? ' toast-' + opts.kind : ''), role: 'status' }, h('span', { text: msg }));
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  if (opts.action) {
    el.append(h('button', { class: 'toast-act', text: opts.label || 'Undo', onclick: () => { close(); opts.action(); } }));
  }
  host.append(el);
  while (host.children.length > 4) host.firstChild.remove();
  timer = setTimeout(close, opts.timeout || (opts.action ? 6000 : 2600));
  return close;
}

/* ── clipboard ────────────────────────────────────────────────── */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ── minimal IndexedDB key/value (for remembering folder handles) ─ */
export const idb = (() => {
  let p;
  const db = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('frogmouth', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => db().then((d) => new Promise((res, rej) => {
    const tx = d.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  }));
  return {
    get: (k) => run('readonly', (s) => s.get(k)).catch(() => undefined),
    set: (k, v) => run('readwrite', (s) => s.put(v, k)).catch(() => undefined),
  };
})();

export const ls = {
  get(k, d) { try { const v = localStorage.getItem('fm:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fm:' + k, JSON.stringify(v)); } catch {} },
};

/* ── icons (inline SVG, stroke-based, 16px grid) ─────────────── */
const ICONS = {
  board: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M6 2.5v11M6 7h7.5"/>',
  key: '<circle cx="5.5" cy="10.5" r="3"/><path d="M7.6 8.4 13.5 2.5M11.5 4.5l2 2M10 6l1.5 1.5"/>',
  note: '<path d="M3 2.5h10v7l-4 4H3z"/><path d="M13 9.5H9v4"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  eyeoff: '<path d="M2 2l12 12M6.5 4C7 3.7 7.5 3.5 8 3.5c4 0 6.5 4.5 6.5 4.5s-.7 1.3-2 2.5M4 5.3C2.4 6.5 1.5 8 1.5 8S4 12.5 8 12.5c1.3 0 2.4-.4 3.3-1"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3a.5.5 0 0 0-.5-.5H3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h2.5"/>',
  edit: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>',
  folder: '<path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H3a1 1 0 0 0-1 1z"/>',
  cmd: '<path d="M5 7.5l3-3 3 3M5 11.5h6"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  map: '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><rect x="7.5" y="6" width="4.5" height="4" rx=".5"/>',
  fit: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 12l4-4 3 3 2-2 2.5 2.5"/>',
  link: '<path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8"/>',
  dice: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="5.5" cy="5.5" r=".8"/><circle cx="10.5" cy="10.5" r=".8"/><circle cx="8" cy="8" r=".8"/>',
  down: '<path d="M4 6l4 4 4-4"/>',
  up: '<path d="M4 10l4-4 4 4"/>',
  tick: '<path d="M3.5 8.5l3 3 6-7"/>',
  dot: '<circle cx="8" cy="8" r="2.5"/>',
  pin: '<path d="M6 2.5h4l-.5 4 2.5 2.5H4L6.5 6.5z"/><path d="M8 9v4.5"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.5" cy="4" r=".6"/><circle cx="2.5" cy="8" r=".6"/><circle cx="2.5" cy="12" r=".6"/>',
  fileok: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/><path d="M5.5 9.8l1.8 1.8 3.4-3.8"/>',
  filedot: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/><circle cx="8" cy="10" r="1.7"/>',
  filebad: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/><path d="M8 7v3M8 12.3v.2"/>',
  filenone: '<path d="M3.5 1.5h6l3 3v10h-9z" stroke-dasharray="2.2 1.6"/><path d="M1.5 1.5l13 13"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ── tags (shared by notes and secrets) ───────────────────────────
   A tag is plain (`api`) or key:value (`env:prod`); keys are the hierarchy
   (env → prod, dev), and a value can go deeper with / (team:platform/infra).
   Filters are space-separated tokens, all of which must hold (AND):
   `api env:prod -draft`. Commas give alternatives (OR): `env:prod,staging`,
   `api,db`. `env:` alone means any env. Prefixes match, so team:platform
   includes team:platform/infra. */
export const Tags = {
  parse(t) { const i = t.indexOf(':'); return i > 0 ? { k: t.slice(0, i), v: t.slice(i + 1) } : { k: t, v: null }; },
  split(s) { return [...new Set(String(s || '').split(/[\s,]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean))]; },
  chip(t, on) {
    const { k, v } = Tags.parse(t);
    return `<button class="chip${v != null ? ' kv' : ''}${on ? ' on' : ''}" data-tag="${esc(t)}" tabindex="-1">${v != null ? `<b>${esc(k)}</b><span>${esc(v)}</span>` : esc(k)}</button>`;
  },
  tokens(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); },
  /* every token must hit (or, with a leading -, miss); a token hits if any of its
     comma alternatives does. A k:v alternative matches a k:v tag by key and value
     prefix; a plain one matches a tag key or value prefix, or appears anywhere in
     one of the lowercase `texts` */
  match(tags, toks, texts = []) {
    const one = (q) => {
      const ci = q.indexOf(':');
      if (ci > 0) {
        const k = q.slice(0, ci), v = q.slice(ci + 1);
        return tags.some((tg) => { const p = Tags.parse(tg); return p.v != null && p.k.toLowerCase() === k && p.v.toLowerCase().startsWith(v); });
      }
      return texts.some((x) => x.includes(q)) ||
        tags.some((tg) => { const p = Tags.parse(tg); return p.k.toLowerCase().startsWith(q) || (p.v != null && p.v.toLowerCase().startsWith(q)); });
    };
    for (const t of toks) {
      let neg = false, q = t;
      if (q[0] === '-' && q.length > 1) { neg = true; q = q.slice(1); }
      if ((Tags.alts(q).some(one)) === neg) return false;
    }
    return true;
  },
  /* `env:prod,staging` → ['env:prod', 'env:staging']; `api,db` → ['api', 'db']; `env:` → ['env:'] */
  alts(q) {
    const ci = q.indexOf(':');
    const list = ci > 0 ? q.slice(ci + 1).split(',').map((v) => q.slice(0, ci + 1) + v.trim()) : q.split(',').map((v) => v.trim());
    return list.filter((a) => a && !(ci > 0 && a === q.slice(0, ci + 1) && list.length > 1));
  },
  /* the tags a filter asks for (not the negated ones), lowercase */
  wanted(toks) { return new Set(toks.filter((t) => t[0] !== '-').flatMap((t) => Tags.alts(t))); },
  /* The tag row as a pivot: plain tags, then each key with its values (env: prod dev
     staging). Counts are over the current results, so they say what a click would
     leave; a key filters any of its values. `all` and `shown` are lists of tag lists. */
  pivot(all, shown, toks) {
    const plain = new Set(), keys = new Map(), n = new Map(), kn = new Map();
    for (const tags of all) for (const t of tags) { const p = Tags.parse(t); if (p.v == null) plain.add(t); else { if (!keys.has(p.k)) keys.set(p.k, new Set()); keys.get(p.k).add(t); } }
    for (const tags of shown) {
      for (const t of new Set(tags)) n.set(t, (n.get(t) || 0) + 1);
      for (const k of new Set(tags.map((t) => Tags.parse(t)).filter((p) => p.v != null).map((p) => p.k))) kn.set(k, (kn.get(k) || 0) + 1);
    }
    const want = Tags.wanted(toks), on = (t) => (want.has(t.toLowerCase()) ? ' on' : '');
    const zero = (c) => (c ? '' : ' zero');
    const sorted = (it) => [...it].sort((a, b) => a.localeCompare(b));
    const chip = (t, label, c, cls = '') => `<button class="chip${cls}${on(t)}${zero(c)}" data-tag="${esc(t)}" tabindex="-1" title="${esc(t)}: ${c} ${c === 1 ? 'match' : 'matches'}. Click to filter, ${isMac ? '⇧' : 'Shift+'}click for either">${label}<i>${c}</i></button>`;
    return sorted(plain).map((t) => chip(t, esc(t), n.get(t) || 0)).join('') +
      sorted(keys.keys()).map((k) => `<span class="tp-group">${chip(k + ':', `<b>${esc(k)}</b>`, kn.get(k) || 0, ' tp-k')}${sorted(keys.get(k)).map((t) => chip(t, esc(Tags.parse(t).v), n.get(t) || 0, ' tp-v')).join('')}</span>`).join('');
  },
  /* shift-click: add a value to the filter as an alternative (env:prod → env:prod,staging) */
  orToggle(q, tag) {
    const p = Tags.parse(tag);
    if (p.v == null || !p.v) return Tags.toggle(q, tag);
    const toks = String(q || '').split(/\s+/).filter(Boolean);
    const i = toks.findIndex((t) => t.toLowerCase().startsWith(p.k.toLowerCase() + ':') && t.length > p.k.length + 1);
    if (i < 0) return Tags.toggle(q, tag);
    const vals = toks[i].slice(p.k.length + 1).split(',').filter(Boolean);
    const j = vals.findIndex((v) => v.toLowerCase() === p.v.toLowerCase());
    if (j >= 0) vals.splice(j, 1); else vals.push(p.v);
    if (vals.length) toks[i] = p.k + ':' + vals.join(','); else toks.splice(i, 1);
    return toks.join(' ') + (toks.length ? ' ' : '');
  },
  toggle(q, tag) {
    const toks = String(q || '').split(/\s+/).filter(Boolean);
    const i = toks.findIndex((t) => t.toLowerCase() === tag.toLowerCase());
    if (i >= 0) toks.splice(i, 1); else toks.push(tag);
    return toks.join(' ') + (toks.length ? ' ' : '');
  },
};
