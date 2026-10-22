import { $$, kb, modKey, clamp, now, h, uid, esc, relTime, toast, copyText, download, icon, Tags, bus } from './00-util.js';
import { Store } from './03-store.js';
import { Modal, tagAssist } from './05-ui.js';
import { App } from './10-app.js';

/* ── secrets: key/value pairs with plain and key:value tags ────────── */
export const Secrets = (() => {
  let root, list, filterInp, countEl, drawer, tagsRow;
  let rows = [], cur = 0, editingId = null, closeEditor = null;
  const revealed = new Set();
  const MASK = '••••••••••••';

  const chip = Tags.chip, tagsOf = Tags.split;

  function init(el) {
    root = el;
    filterInp = h('input', { class: 'field s-filter', placeholder: 'Filter by key or tags: env:prod,staging aws -legacy', spellcheck: 'false', autocomplete: 'off' });
    tagAssist(filterInp, () => Store.tagCounts('secrets'));
    countEl = h('span', { class: 's-count muted' });
    list = h('div', { class: 's-list', role: 'listbox', tabindex: '0' });
    drawer = h('aside', { class: 's-drawer', hidden: true });
    tagsRow = h('div', { class: 's-tagrow' });
    tagsRow.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) toggleFilter(c.dataset.tag, e.shiftKey); });
    root.append(
      h('div', { class: 's-bar' },
        h('div', { class: 's-search', html: icon('search') }, filterInp),
        countEl,
        h('button', { class: 'btn', html: `${icon('plus')}New secret <kbd>N</kbd>`, onclick: () => edit(null) }),
        h('button', { class: 'btn ghost', text: 'Export JSON', title: 'Download every secret as a JSON file', onclick: () => exportJson() })),
      tagsRow,
      h('div', { class: 's-head' }, h('span', { text: 'Key' }), h('span', { text: 'Value' }), h('span', { text: 'Tags' }), h('span')),
      list, drawer);

    filterInp.addEventListener('input', () => { cur = 0; render(); });
    filterInp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && modKey(e)) { e.preventDefault(); if (rows[cur]) edit(rows[cur]); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[cur]) copy(rows[cur]); }
      else if (e.key === 'Escape') { e.preventDefault(); if (filterInp.value) { filterInp.value = ''; render(); } else list.focus(); }
    });
    list.addEventListener('click', (e) => {
      const tagB = e.target.closest('.chip');
      if (tagB) { toggleFilter(tagB.dataset.tag); return; }
      const row = e.target.closest('.srow'); if (!row) return;
      const x = Store.secret(row.dataset.id); if (!x) return;
      cur = rows.indexOf(x);
      const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'copy') copy(x);
      else if (a && a.dataset.a === 'reveal') reveal(x);
      else if (a && a.dataset.a === 'key') copyKey(x);
      else if (a && a.dataset.a === 'delete') { mark(); askDelete(x); }
      else { mark(); }
    });
    // a click on the dimmed page outside the editor closes it, keeping any changes
    root.addEventListener('mousedown', (e) => { if (e.target === root && closeEditor) { e.preventDefault(); closeEditor(); } }); // focus stays in the editor if it stays open
    // a locked or closed vault leaves nothing behind: no rows, no revealed values
    bus.on('closed', () => { revealed.clear(); rows = []; cur = 0; filterInp.value = ''; list.replaceChildren(); tagsRow.replaceChildren(); drawer.hidden = true; drawer.replaceChildren(); root.classList.remove('drawer-open'); closeEditor = null; });
    list.addEventListener('dblclick', (e) => { const row = e.target.closest('.srow'); if (row && !e.target.closest('button')) edit(Store.secret(row.dataset.id)); });
  }

  /* ── filtering ── */
  const matches = (x, toks) => Tags.match(x.tags, toks, [x.key.toLowerCase(), x.desc.toLowerCase()]);
  function toggleFilter(tag, either) { filterInp.value = (either ? Tags.orToggle : Tags.toggle)(filterInp.value, tag); cur = 0; render(); }
  function setFilter(q) { filterInp.value = q; cur = 0; render(); }

  /* ── rendering ── */
  function render() {
    if (!root || !Store.S.data) return;
    const toks = filterInp.value.toLowerCase().split(/\s+/).filter(Boolean);
    const active = Tags.wanted(toks);
    const all = Store.S.data.secrets;
    rows = all.filter((x) => matches(x, toks)).sort((a, b) => a.key.localeCompare(b.key) || (b.updated || 0) - (a.updated || 0));
    cur = clamp(cur, 0, Math.max(0, rows.length - 1));
    tagsRow.innerHTML = Tags.pivot(all.map((x) => x.tags), rows.map((x) => x.tags), toks);
    countEl.textContent = toks.length ? `${rows.length} of ${all.length}` : `${all.length} ${all.length === 1 ? 'secret' : 'secrets'}`;
    if (!all.length) {
      list.innerHTML = `<div class="s-empty"><p>No secrets yet.</p><p class="muted">Press <kbd>N</kbd> to add one. Tags like <code>env:prod</code> group them.</p></div>`;
      return;
    }
    if (!rows.length) { list.innerHTML = `<div class="s-empty"><p>Nothing matches “${esc(filterInp.value.trim())}”.</p><p class="muted">Press <kbd>Esc</kbd> to clear the filter.</p></div>`; return; }
    let out = '';
    rows.forEach((x, i) => {
      const show = revealed.has(x.id);
      const v = show ? esc(x.value.length > 400 ? x.value.slice(0, 400) + '…' : x.value) : MASK;
      out += `<div class="srow${i === cur ? ' on' : ''}" data-id="${esc(x.id)}" role="option">` +
        `<div class="s-key"><button class="s-keyname" data-a="key" tabindex="-1" title="Copy key">${esc(x.key)}</button>${x.desc ? `<div class="s-desc">${esc(x.desc)}</div>` : ''}</div>` +
        `<div class="s-val${show ? ' shown' : ''}">${v}</div>` +
        `<div class="s-tags">${x.tags.map((t) => chip(t, active.has(t.toLowerCase()))).join('')}</div>` +
        `<div class="s-act"><button data-a="reveal" title="Reveal (Space)" tabindex="-1">${icon(show ? 'eyeoff' : 'eye')}</button>` +
        `<button data-a="copy" title="Copy value (C)" tabindex="-1">${icon('copy')}</button>` +
        `<button data-a="delete" class="s-del" title="Delete (Del): asks three times" aria-label="Delete ${esc(x.key)}" tabindex="-1">${icon('x')}</button></div></div>`;
    });
    list.innerHTML = out;
    scrollCur();
  }
  function mark() {
    $$('.srow.on', list).forEach((r) => r.classList.remove('on'));
    const x = rows[cur]; if (!x) return;
    const el = list.querySelector(`.srow[data-id="${CSS.escape(x.id)}"]`);
    if (el) el.classList.add('on');
    scrollCur();
  }
  function scrollCur() { const el = list.querySelector('.srow.on'); if (el) el.scrollIntoView({ block: 'nearest' }); }
  function move(d) { if (!rows.length) return; cur = clamp(cur + d, 0, rows.length - 1); mark(); }

  /* ── actions ── */
  async function copy(x) {
    if (await copyText(x.value)) { toast(`Copied ${x.key}`); flash(x); }
  }
  async function copyKey(x) { if (await copyText(x.key)) toast(`Copied the name ${x.key}`); }
  function flash(x) {
    const el = list.querySelector(`.srow[data-id="${CSS.escape(x.id)}"]`);
    if (el) { el.classList.remove('copied'); void el.offsetWidth; el.classList.add('copied'); }
  }
  function reveal(x) {
    if (revealed.has(x.id)) revealed.delete(x.id); else revealed.add(x.id);
    render();
  }
  function remove(x) {
    const all = Store.S.data.secrets;
    const i = all.indexOf(x); if (i < 0) return;
    all.splice(i, 1);
    Store.change('secrets');
    render();
    App.pushUndo(`Deleted ${x.key}`, () => { all.splice(Math.min(i, all.length), 0, x); Store.change('secrets'); render(); });
  }

  function generate(len = 32) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from(a, (b) => abc[b & 63]).join('');
  }

  /* ── edit drawer ── */
  function edit(x) {
    const isNew = !x;
    editingId = x ? x.id : null;
    const keyI = h('input', { class: 'field mono', value: x ? x.key : '', placeholder: 'STRIPE_SECRET_KEY', spellcheck: 'false', autocomplete: 'off' });
    const valI = h('textarea', { class: 'field mono masked', rows: '3', placeholder: 'value', spellcheck: 'false', autocomplete: 'off', 'data-shy': '' });
    valI.value = x ? x.value : '';
    const tagI = h('input', { class: 'field mono', value: x ? x.tags.join(' ') : (filterInp.value.split(/\s+/).filter((t) => t && t[0] !== '-' && /:|^[a-z]/i.test(t) && Store.S.data.secrets.some((s) => s.tags.includes(t))).join(' ')), placeholder: 'env:prod aws billing', spellcheck: 'false', autocomplete: 'off' });
    const descI = h('input', { class: 'field', value: x ? x.desc : '', placeholder: 'Where it is used, who owns it', spellcheck: 'false' });
    const preview = h('div', { class: 'tag-preview' });
    const sugg = h('div', { class: 'tag-sugg' });
    const eyeB = h('button', { class: 'icon-btn', type: 'button', title: 'Show value', html: icon('eye') });
    const genB = h('button', { class: 'icon-btn', type: 'button', title: 'Generate a random value', html: icon('dice') });
    eyeB.onclick = () => { valI.classList.toggle('masked'); eyeB.innerHTML = icon(valI.classList.contains('masked') ? 'eye' : 'eyeoff'); };
    genB.onclick = () => { valI.value = generate(); valI.classList.remove('masked'); eyeB.innerHTML = icon('eyeoff'); };
    const upd = () => {
      preview.innerHTML = tagsOf(tagI.value).map((t) => chip(t)).join('');
      const have = new Set(tagsOf(tagI.value));
      const freq = new Map();
      for (const s of Store.S.data.secrets) for (const t of s.tags) if (!have.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
      sugg.innerHTML = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => chip(t)).join('');
    };
    sugg.addEventListener('mousedown', (e) => { const c = e.target.closest('.chip'); if (!c) return; e.preventDefault(); tagI.value = (tagI.value.trim() + ' ' + c.dataset.tag).trim() + ' '; upd(); tagI.focus(); });
    tagI.addEventListener('input', upd);
    upd();

    const save = () => {
      const key = keyI.value.trim();
      if (!key) { keyI.focus(); keyI.classList.add('bad'); return; }
      const tags = [...new Set(tagsOf(tagI.value))];
      const t = now();
      if (isNew) {
        const nx = { id: uid(), key, value: valI.value, tags, desc: descI.value.trim(), created: t, updated: t };
        Store.S.data.secrets.push(nx);
        toast(`Added ${key}`);
      } else {
        Object.assign(x, { key, value: valI.value, tags, desc: descI.value.trim(), updated: t });
        toast(`Saved ${key}`);
      }
      Store.change('secrets');
      close();
      render();
      const target = isNew ? Store.S.data.secrets[Store.S.data.secrets.length - 1] : x;
      cur = Math.max(0, rows.indexOf(target)); mark();
      list.focus();
    };
    const close = () => { drawer.hidden = true; drawer.replaceChildren(); editingId = null; closeEditor = null; root.classList.remove('drawer-open'); };
    /* a click outside closes the editor only when nothing changed. With changes it neither
       saves (a stray click must not overwrite a secret) nor discards them: it says how to do either */
    const fields = () => [keyI.value, valI.value, tagI.value, descI.value].join('\u0000'), was = fields();
    const pending = h('p', { class: 'd-pending', role: 'status', hidden: true, html: `Unsaved changes. <kbd>${kb('mod+enter')}</kbd> saves, <kbd>Esc</kbd> discards.` });
    closeEditor = () => {
      if (fields() === was) { close(); list.focus(); return; }
      pending.hidden = false;
      pending.classList.remove('nudge'); void pending.offsetWidth; pending.classList.add('nudge');
      if (!drawer.contains(document.activeElement)) keyI.focus();
    };

    drawer.replaceChildren(...[
      h('div', { class: 'd-head' }, h('h3', { text: isNew ? 'New secret' : x.key }), h('button', { class: 'icon-btn', title: 'Close (Esc)', html: icon('x'), onclick: () => { close(); list.focus(); } })),
      h('label', null, h('span', { text: 'Key' }), keyI),
      h('label', null, h('span', { text: 'Value' }), h('div', { class: 'val-wrap' }, valI, h('div', { class: 'val-tools' }, eyeB, genB))),
      h('label', null, h('span', { html: 'Tags <em>space separated; <code>key:value</code> for grouped tags</em>' }), tagI, preview),
      sugg,
      h('label', null, h('span', { text: 'Note' }), descI),
      x ? h('p', { class: 'muted small', text: `Created ${relTime(x.created)}. Updated ${relTime(x.updated)}.` }) : null,
      pending,
      h('div', { class: 'd-actions' },
        x ? h('button', { class: 'btn danger ghost', text: 'Delete…', title: 'Delete this secret: asks three times', onclick: async () => { if (await askDelete(x)) close(); } }) : h('span'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { close(); list.focus(); } }),
        h('button', { class: 'btn primary', html: `${isNew ? 'Add secret' : 'Save'} <kbd>${kb('mod+enter')}</kbd>`, onclick: save }))].filter(Boolean));
    drawer.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); list.focus(); }
      if (e.key === 'Enter' && (modKey(e) || (e.target.tagName === 'INPUT'))) { e.preventDefault(); save(); }
    };
    drawer.hidden = false;
    root.classList.add('drawer-open');
    (isNew ? keyI : valI).focus();
  }

  /* Deleting a secret takes three separate confirmations, each with the safe choice
     focused, so no stray click or key can do it: a warning, the key name typed out,
     and a last check. Resolves true when the secret was deleted. */
  async function askDelete(x) {
    const step = (n) => h('p', { class: 'muted small', text: `Step ${n} of 3` });
    const go = await Modal.open({
      title: `Delete ${x.key}?`,
      body: h('div', null, step(1), h('p', { class: 'muted', text: 'The secret and its value will be removed from this vault.' })),
      actions: [{ label: 'Cancel', value: false }, { label: 'Continue', primary: true, danger: true, value: true }],
    });
    if (!go) return false;
    const inp = h('input', { class: 'field mono', placeholder: x.key, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Key name' });
    inp.addEventListener('input', () => { inp.closest('.modal').querySelector('.btn.primary').disabled = inp.value !== x.key; });
    const typed = await Modal.open({
      title: 'Type the key name to confirm',
      body: h('div', null, step(2), h('p', { class: 'muted', html: `Type <code>${esc(x.key)}</code> exactly.` }), inp),
      actions: [{ label: 'Cancel', value: false }, { label: 'Continue', primary: true, danger: true, disabled: true, run: () => inp.value === x.key }],
    });
    if (!typed) return false;
    const sure = await Modal.open({
      title: `Last check: delete ${x.key}?`,
      body: h('div', null, step(3), h('p', { class: 'muted', text: 'It leaves the vault file with the next save. Undo works only until you close this tab.' })),
      actions: [{ label: 'Keep it', value: false }, { label: 'Delete secret', primary: true, danger: true, value: true }],
    });
    if (!sure || !Store.S.data.secrets.includes(x)) return false;
    remove(x);
    list.focus({ preventScroll: true });
    return true;
  }

  /* every secret (not the notes) as a JSON download */
  async function exportJson() {
    const all = Store.S.data.secrets;
    if (!all.length) { toast('There are no secrets to export'); return; }
    const ok = await Modal.confirm('Export all secrets as JSON?',
      `The file will hold all ${all.length} secret ${all.length === 1 ? 'value' : 'values'} in plain text. Keep it somewhere safe and delete it when you are done.`, 'Export JSON', false);
    if (!ok) return;
    const day = new Date().toISOString().slice(0, 10);
    const out = {
      frogmouth: 1,
      kind: 'secrets',
      exported: new Date().toISOString(),
      secrets: all.slice().sort((a, b) => a.key.localeCompare(b.key)).map((x) => ({
        key: x.key, value: x.value, tags: x.tags.slice(), note: x.desc || '',
        created: x.created ? new Date(x.created).toISOString() : null,
        updated: x.updated ? new Date(x.updated).toISOString() : null,
      })),
    };
    download(`frogmouth-secrets-${day}.json`, JSON.stringify(out, null, 2) + '\n');
    toast(`Exported ${all.length} ${all.length === 1 ? 'secret' : 'secrets'} to frogmouth-secrets-${day}.json`);
  }



  /* ── keyboard (view focused, not typing) ── */
  function key(e) {
    if (!drawer.hidden) return false;
    const x = rows[cur];
    const k = e.key;
    if (k === 'j' || k === 'ArrowDown') { move(1); return true; }
    if (k === 'k' || k === 'ArrowUp') { move(-1); return true; }
    if (k === 'g') { cur = 0; mark(); return true; }
    if (k === 'G') { cur = rows.length - 1; mark(); return true; }
    if (k === '/') { filterInp.focus(); filterInp.select(); return true; }
    if (k === 'n' || k === 'N') { edit(null); return true; }
    if (k === 'Escape' && filterInp.value) { setFilter(''); return true; }
    if (!x) return false;
    if (k === 'Enter' || k === 'e') { edit(x); return true; }
    if (k === 'c' || k === 'y') { copy(x); return true; }
    if (k === 'C' || k === 'Y') { copyKey(x); return true; }
    if (k === ' ') { reveal(x); return true; }
    if (k === 'Delete' || k === 'Backspace') { askDelete(x); return true; }
    return false;
  }

  function focus() { if (drawer.hidden) list.focus({ preventScroll: true }); }
  function select(id) { const x = Store.secret(id); if (!x) return; if (!matches(x, filterInp.value.toLowerCase().split(/\s+/).filter(Boolean))) setFilter(''); cur = rows.indexOf(x); mark(); flash(x); }

  return { init, render, key, focus, edit, select, setFilter, exportJson };
})();
