/* ── Popup: one floating, keyboard-driven list used for /, @, pickers ─ */
const Popup = (() => {
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

  addEventListener('mousedown', (e) => { if (el && !el.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());
  return { open, update, close, key, isOpen: () => !!el };
})();

/* ── Modal dialogs (never native alert/confirm/prompt) ─────────── */
const Modal = (() => {
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
      if (f) f.focus();
    });
  }

  const confirm = (title, text, label = 'Delete', danger = true) =>
    open({ title, body: h('p', { class: 'muted', text }), actions: [{ label: 'Cancel', value: false }, { label, primary: true, danger, value: true }] }).then(Boolean);

  function prompt(title, value = '', { placeholder = '', label = 'Save', shy = false, type = 'text', hint } = {}) {
    const inp = h('input', { class: 'field', value, placeholder, type, spellcheck: 'false', autocomplete: 'off' });
    if (shy) inp.setAttribute('data-shy', '');
    return open({ title, body: h('div', null, inp, hint ? h('p', { class: 'muted small', text: hint }) : null),
      actions: [{ label: 'Cancel', value: null }, { label, primary: true, run: () => inp.value }] });
  }

  return { open, confirm, prompt, isOpen: () => stack.length > 0 };
})();

/* ── inline tag editor with completion from every tag in the vault ── */
function editTags(host, tags, onDone) {
  const inp = h('input', { class: 'tag-input', value: tags.length ? tags.join(' ') + ' ' : '', placeholder: 'api env:prod …', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Tags, space separated' });
  host.replaceChildren(inp);
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    Popup.close();
    onDone(save ? Tags.split(inp.value) : null);
  };
  const lastTok = () => inp.value.slice(inp.value.lastIndexOf(' ') + 1);
  const suggest = () => {
    const tok = lastTok().toLowerCase();
    if (!tok) { Popup.close(); return; }
    const have = new Set(Tags.split(inp.value.slice(0, inp.value.length - tok.length)));
    const items = Store.allTags().filter((t) => t.toLowerCase().startsWith(tok) && t.toLowerCase() !== tok && !have.has(t)).slice(0, 12)
      .map((t) => ({ label: t, labelHtml: Tags.chip(t), tag: t }));
    if (!items.length) { Popup.close(); return; }
    if (Popup.isOpen()) { Popup.update(items); return; }
    const r = inp.getBoundingClientRect();
    Popup.open({
      x: r.left, y: r.bottom + 2, items,
      onPick: (it) => {
        inp.value = inp.value.slice(0, inp.value.length - lastTok().length) + it.tag + ' ';
        inp.focus();
      },
    });
  };
  inp.addEventListener('input', suggest);
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (Popup.isOpen() && ['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key) && Popup.key(e)) { e.preventDefault(); return; }
    if (Popup.isOpen() && e.key === 'Enter' && lastTok()) { if (Popup.key(e)) { e.preventDefault(); return; } }
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); if (Popup.isOpen()) Popup.close(); else finish(false); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) finish(true); }, 120));
  return inp;
}
