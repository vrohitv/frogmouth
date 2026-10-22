import { modKey, clamp, h, esc, icon, Tags } from './00-util.js';
import { Store } from './03-store.js';

/* ── Popup: one floating, keyboard-driven list used for /, @, pickers ─ */
export const Popup = (() => {
  let el = null, items = [], idx = 0, opts = null;

  function render() {
    const list = el.querySelector('.pop-list');
    if (!items.length) {
      list.innerHTML = `<div class="pop-empty">${esc(opts.empty || 'No matches')}</div>`;
      return;
    }
    list.innerHTML = items.map((it, i) =>
      `<div class="pop-item${i === idx ? ' on' : ''}" data-i="${i}">` +
      (it.icon ? `<span class="pop-ic">${it.icon.startsWith('<') ? it.icon : icon(it.icon)}</span>` : '') +
      `<span class="pop-label">${it.labelHtml || esc(it.label)}</span>` +
      (it.hint ? `<span class="pop-hint">${esc(it.hint)}</span>` : '') + '</div>').join('');
    const on = list.children[idx];
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function place(x, y) {
    const r = el.getBoundingClientRect();
    let left = clamp(x, 8, innerWidth - r.width - 8);
    let top = y + 6;
    if (top + r.height > innerHeight - 8) top = Math.max(8, (opts.above != null ? opts.above : y) - r.height - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function open(o) {
    close();
    opts = o; items = o.items || []; idx = 0;
    el = h('div', { class: 'pop', role: 'listbox' },
      o.title ? h('div', { class: 'pop-title', text: o.title }) : null,
      o.input ? h('input', { class: 'pop-input', placeholder: o.placeholder || 'Filter', spellcheck: 'false' }) : null,
      h('div', { class: 'pop-list' }));
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.pop-input')) return;
      e.preventDefault();
      const it = e.target.closest('.pop-item');
      if (it) pick(+it.dataset.i);
    });
    el.addEventListener('mousemove', (e) => {
      const it = e.target.closest('.pop-item');
      if (it && +it.dataset.i !== idx) { idx = +it.dataset.i; render(); }
    });
    document.body.append(el);
    render();
    place(o.x, o.y);
    if (o.input) {
      const inp = el.querySelector('.pop-input');
      inp.addEventListener('input', () => o.onQuery && o.onQuery(inp.value));
      inp.addEventListener('keydown', (e) => { if (key(e)) { e.preventDefault(); e.stopPropagation(); } });
      inp.focus();
    }
  }

  function update(list) {
    if (!el) return;
    items = list; idx = Math.min(idx, Math.max(0, items.length - 1));
    if (idx < 0) idx = 0;
    render();
  }

  function pick(i) {
    const it = items[i];
    const o = opts;
    close(true);
    if (it && o && o.onPick) o.onPick(it);
  }

  function close(picked) {
    if (!el) return;
    el.remove(); el = null;
    const o = opts; opts = null;
    if (o && o.onClose) o.onClose(!!picked);
  }

  /* returns true when the key was consumed */
  function key(e) {
    if (!el) return false;
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { idx = (idx + 1) % Math.max(1, items.length); render(); return true; }
    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { idx = (idx - 1 + items.length) % Math.max(1, items.length); render(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { if (items.length) { pick(idx); return true; } close(); return e.key === 'Tab'; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
  }

  // pointerdown, not mousedown: the board cancels pointerdown (to drag notes), which suppresses mousedown
  addEventListener('pointerdown', (e) => { if (el && !el.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());
  return { open, update, close, key, isOpen: () => !!el };
})();

/* ── Modal dialogs (never native alert/confirm/prompt) ─────────── */
export const Modal = (() => {
  let stack = [];
  function open({ title, body, actions = [], wide, onClose, cls }) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const card = h('div', { class: 'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
      const scrim = h('div', { class: 'scrim' }, card);
      const done = (v) => {
        scrim.remove();
        stack = stack.filter((m) => m !== scrim);
        if (onClose) onClose(v);
        if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
        resolve(v);
      };
      scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) done(null); });
      card.append(h('h2', { text: title }));
      if (body) card.append(typeof body === 'function' ? body(done) : body);
      if (actions.length) {
        card.append(h('div', { class: 'modal-actions' }, actions.map((a) =>
          h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), text: a.label, onclick: async () => {
            const v = a.value !== undefined ? a.value : a.run ? await a.run() : true;
            if (v !== false) done(v);
          } }))));
      }
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && (modKey(e) || (e.target.tagName === 'INPUT'))) {
          const p = actions.find((a) => a.primary);
          if (p) { e.preventDefault(); card.querySelector('.btn.primary').click(); }
        }
      });
      document.body.append(scrim);
      stack.push(scrim);
      const f = card.querySelector('input,textarea,select,.btn.primary');
      if (f) f.focus({ preventScroll: true }); // open at the top, even when the focused button is at the bottom
    });
  }

  const confirm = (title, text, label = 'Delete', danger = true) =>
    open({ title, body: h('p', { class: 'muted', text }), actions: [{ label: 'Cancel', value: false }, { label, primary: true, danger, value: true }] }).then(Boolean);

  function prompt(title, value = '', { placeholder = '', label = 'Save' } = {}) {
    const inp = h('input', { class: 'field', value, placeholder, spellcheck: 'false', autocomplete: 'off' });
    return open({ title, body: h('div', null, inp),
      actions: [{ label: 'Cancel', value: null }, { label, primary: true, run: () => inp.value }] });
  }

  return { open, confirm, prompt, isOpen: () => stack.length > 0 };
})();

/* ── inline fields: an input that edits something in place (tags, a board name) ──
   Enter saves, Esc cancels, and leaving the field saves: focus moving away, or a press
   anywhere outside it. The press counts even where the page cancels it and so keeps
   focus where it was (the board does, to drag notes and pan), and even when the field
   was taken out of the page meanwhile (removing an element never blurs it). The save
   waits for the press to end, so a click on another board pill still lands on it.
   end(save) runs exactly once; `inside` is a selector for parts that belong to the
   field (its suggestions), `key(e)` sees keys first and returns true for its own. */
export function inlineField(inp, end, { inside, key } = {}) {
  let over = false, pressing = false;
  const finish = (save) => {
    if (over) return;
    over = true;
    removeEventListener('pointerdown', down, true);
    end(save);
  };
  const up = () => {
    removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    setTimeout(() => finish(true)); // after the click this press makes
  };
  function down(e) {
    if (pressing || inp.contains(e.target) || (inside && e.target.closest && e.target.closest(inside))) return;
    pressing = true;
    addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  }
  addEventListener('pointerdown', down, true);
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keys type here, they are not shortcuts
    if (e.isComposing || (key && key(e))) return; // Enter that ends an IME composition is not a save
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  // Tab, or a click on something that takes focus; not a switch to another window (focus stays here)
  inp.addEventListener('blur', () => setTimeout(() => { if (!pressing && document.activeElement !== inp) finish(true); }));
  return finish;
}

/* ── inline tag editor with completion from every tag in the vault ── */
export function editTags(host, tags, onDone) {
  const inp = h('input', { class: 'tag-input', value: tags.length ? tags.join(' ') + ' ' : '', placeholder: 'api env:prod …', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Tags, space separated' });
  host.replaceChildren(inp);
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
  let mine = false; // the suggestions on screen are this field's
  const lastTok = () => inp.value.slice(inp.value.lastIndexOf(' ') + 1);
  const suggest = () => {
    const tok = lastTok().toLowerCase();
    if (!tok) { if (mine) Popup.close(); return; }
    const have = new Set(Tags.split(inp.value.slice(0, inp.value.length - tok.length)));
    const items = Store.allTags().filter((t) => t.toLowerCase().startsWith(tok) && t.toLowerCase() !== tok && !have.has(t)).slice(0, 12)
      .map((t) => ({ label: t, labelHtml: Tags.chip(t), tag: t }));
    if (!items.length) { if (mine) Popup.close(); return; }
    if (mine && Popup.isOpen()) { Popup.update(items); return; }
    const r = inp.getBoundingClientRect();
    Popup.open({
      x: r.left, y: r.bottom + 2, items,
      onPick: (it) => {
        inp.value = inp.value.slice(0, inp.value.length - lastTok().length) + it.tag + ' ';
        inp.focus();
      },
      onClose: () => { mine = false; },
    });
    mine = true;
  };
  inp.addEventListener('input', suggest);
  inlineField(inp, (save) => {
    if (mine) Popup.close();
    const out = save ? Tags.split(inp.value) : null;
    // the input goes before onDone, so the host can show its chips again (a host that
    // still holds an input takes it for an edit in progress and leaves it alone)
    inp.remove();
    onDone(out);
  }, {
    inside: '.pop',
    key: (e) => {
      if (!mine || !Popup.isOpen()) return false;
      // Enter picks a suggestion while a word is being typed; after a space it saves
      if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key) || (e.key === 'Enter' && lastTok())) { if (Popup.key(e)) { e.preventDefault(); return true; } }
      if (e.key === 'Escape') { e.preventDefault(); Popup.close(); return true; } // first Esc closes the suggestions
      return false;
    },
  });
  return inp;
}

/* Tag completion for a search field: suggests tags for the word being typed, with how
   many items carry each. Typing a key offers the key first (env → env:) and then its
   values; after a comma it offers the key's other values (env:prod,st → staging).
   Tab or Enter completes, arrows move, Esc closes. source() gives a Map tag -> count. */
export function tagAssist(inp, source) {
  let mine = false;
  const word = () => {
    const end = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
    const start = inp.value.lastIndexOf(' ', end - 1) + 1;
    let w = inp.value.slice(start, end);
    const neg = w[0] === '-' ? '-' : '';
    if (neg) w = w.slice(1);
    const ci = w.indexOf(':'), comma = w.lastIndexOf(',');
    const key = ci > 0 && comma > ci ? w.slice(0, ci) : null; // a further value of this key, after a comma
    const head = comma >= 0 ? w.slice(0, comma + 1) : '';
    return { start, end, from: start + neg.length + head.length, part: w.slice(comma + 1), key, head };
  };
  function items() {
    const w = word(), q = w.part.toLowerCase();
    if (!q && !w.key) return [];
    const counts = source(), out = [];
    if (w.key) {
      const have = new Set(w.head.toLowerCase().slice(w.key.length + 1).split(',').filter(Boolean));
      for (const [t, n] of counts) {
        const p = Tags.parse(t);
        if (p.v != null && p.k.toLowerCase() === w.key.toLowerCase() && p.v.toLowerCase().startsWith(q) && !have.has(p.v.toLowerCase())) out.push({ label: t, labelHtml: Tags.chip(t), hint: String(n), text: p.v, n });
      }
    } else {
      const keys = new Map();
      for (const [t, n] of counts) {
        const p = Tags.parse(t), tl = t.toLowerCase();
        if (q.indexOf(':') < 0 && p.v != null && p.k.toLowerCase().startsWith(q)) keys.set(p.k, (keys.get(p.k) || 0) + n);
        if (tl.startsWith(q) && tl !== q) out.push({ label: t, labelHtml: Tags.chip(t), hint: String(n), text: t, n });
      }
      for (const [k, n] of keys) out.push({ label: k + ':', labelHtml: `<span class="chip kv"><b>${esc(k)}</b><span>any</span></span>`, hint: String(n), text: k + ':', key: true, n: Infinity });
    }
    return out.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 12);
  }
  function apply(it) {
    const w = word(), after = inp.value.slice(w.end);
    const add = it.text + (it.key || /^\s/.test(after) ? '' : ' ');
    inp.value = inp.value.slice(0, w.from) + add + after;
    const pos = w.from + add.length;
    inp.setSelectionRange(pos, pos);
    inp.focus();
    inp.dispatchEvent(new Event('input', { bubbles: true })); // the page filters, and a key goes on to its values
  }
  function suggest() {
    const list = items();
    if (!list.length) { if (mine) Popup.close(); return; }
    if (mine && Popup.isOpen()) { Popup.update(list); return; }
    const r = inp.getBoundingClientRect();
    Popup.open({ x: r.left, y: r.bottom, title: 'Tags  ·  Tab to complete', items: list, onPick: apply, onClose: () => { mine = false; } });
    mine = true;
  }
  inp.addEventListener('input', suggest);
  // capture, so it runs before the field's own keys (arrows, Enter, Esc)
  inp.addEventListener('keydown', (e) => {
    if (!mine || !Popup.isOpen() || !['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) return;
    if (Popup.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  inp.addEventListener('blur', () => setTimeout(() => { if (mine && document.activeElement !== inp) Popup.close(); }, 120));
}
