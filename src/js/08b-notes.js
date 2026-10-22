import { $$, clamp, now, h, esc, relTime, ls, icon, Tags, bus } from './00-util.js';
import { Store } from './03-store.js';
import { Popup, editTags, tagAssist } from './05-ui.js';
import { Board } from './07-board.js';
import { App } from './10-app.js';

/* ── notes page: every note on every board, sortable, filterable, linked ─ */
export const NotesList = (() => {
  let root, list, head, filterInp, countEl, tagsRow;
  let rows = [], cur = 0, back = new Map();
  let sort = ls.get('notes-sort', { by: 'updated', dir: -1 });
  const COLS = [['title', 'Title'], ['board', 'Board'], ['tags', 'Tags'], ['links', 'Links'], ['updated', 'Updated']];

  function init(el) {
    root = el;
    filterInp = h('input', { class: 'field s-filter', placeholder: 'Filter by text, board or tags: deploy env:prod,staging -draft', spellcheck: 'false', autocomplete: 'off' });
    tagAssist(filterInp, () => Store.tagCounts('notes'));
    countEl = h('span', { class: 's-count muted' });
    tagsRow = h('div', { class: 's-tagrow' });
    head = h('div', { class: 'n-head' });
    list = h('div', { class: 's-list', role: 'listbox', tabindex: '0', 'aria-label': 'All notes' });
    root.append(
      h('div', { class: 's-bar' }, h('div', { class: 's-search', html: icon('search') }, filterInp), countEl),
      tagsRow, head, list);

    filterInp.addEventListener('input', () => { cur = 0; render(); });
    bus.on('closed', () => { rows = []; cur = 0; back = new Map(); filterInp.value = ''; list.replaceChildren(); tagsRow.replaceChildren(); });
    filterInp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[cur]) open(rows[cur]); }
      else if (e.key === 'Escape') { e.preventDefault(); if (filterInp.value) setFilter(''); else list.focus(); }
    });
    tagsRow.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setFilter((e.shiftKey ? Tags.orToggle : Tags.toggle)(filterInp.value, c.dataset.tag)); });
    head.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      const by = b.dataset.sort;
      sort = sort.by === by ? { by, dir: -sort.dir } : { by, dir: by === 'updated' || by === 'links' ? -1 : 1 };
      ls.set('notes-sort', sort);
      render();
    });
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.nrow'); if (!row) return;
      const r = rows.find((x) => x.note.id === row.dataset.id); if (!r) return;
      cur = rows.indexOf(r);
      const a = e.target.closest('[data-a]');
      const chip = e.target.closest('.chip');
      if (chip) setFilter(Tags.toggle(filterInp.value, chip.dataset.tag));
      else if (a && a.dataset.a === 'board') App.gotoNote(r.note.id, a.dataset.board);
      else if (a && a.dataset.a === 'place') App.addToBoard(r.note.id, a);
      else if (a && a.dataset.a === 'tag') tag(r);
      else if (a && (a.dataset.a === 'out' || a.dataset.a === 'in')) linksMenu(r, a.dataset.a, a);
      else if (e.target.closest('.n-tags')) mark();
      else open(r);
    });
  }

  /* ── data ── */
  const snippet = (note) => (note.text || '').split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  const SORTS = {
    title: (a, b) => (a.note.title || '').localeCompare(b.note.title || '', undefined, { sensitivity: 'base' }),
    board: (a, b) => (a.boards[0] ? a.boards[0].name : '\uffff').localeCompare(b.boards[0] ? b.boards[0].name : '\uffff') || SORTS.title(a, b),
    tags: (a, b) => (a.note.tags || []).join(' ').localeCompare((b.note.tags || []).join(' ')) || SORTS.title(a, b),
    links: (a, b) => a.links - b.links || SORTS.title(a, b),
    updated: (a, b) => (a.note.updated || 0) - (b.note.updated || 0),
  };

  function render() {
    if (!root || !Store.S.data) return;
    back = Store.backlinks();
    const toks = Tags.tokens(filterInp.value);
    const active = Tags.wanted(toks);
    const all = [...Store.S.notes.values()].map(({ note, boards }) => {
      const out = Store.linksOut(note), inn = back.get(note.id) || [];
      return { note, boards, out, inn, links: out.length + inn.length };
    });
    rows = all.filter(({ note, boards }) => Tags.match(note.tags || [], toks, [(note.title || '').toLowerCase(), (note.text || '').toLowerCase(), ...(boards.length ? boards.map((b) => b.name.toLowerCase()) : ['no board'])]));
    rows.sort((a, b) => sort.dir * SORTS[sort.by](a, b));
    cur = clamp(cur, 0, Math.max(0, rows.length - 1));

    tagsRow.innerHTML = Tags.pivot(all.map((r) => r.note.tags || []), rows.map((r) => r.note.tags || []), toks);
    countEl.textContent = toks.length ? `${rows.length} of ${all.length}` : `${all.length} ${all.length === 1 ? 'note' : 'notes'}`;
    head.innerHTML = COLS.map(([id, label]) =>
      `<button data-sort="${id}" class="${sort.by === id ? 'on' : ''}" aria-sort="${sort.by === id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${sort.by === id ? `<i>${sort.dir > 0 ? '↑' : '↓'}</i>` : ''}</button>`).join('');

    if (!all.length) { list.innerHTML = `<div class="s-empty"><p>No notes yet.</p><p class="muted">Open a board and double-click anywhere, or press <kbd>N</kbd> there.</p></div>`; return; }
    if (!rows.length) { list.innerHTML = `<div class="s-empty"><p>Nothing matches “${esc(filterInp.value.trim())}”.</p><p class="muted">Press <kbd>Esc</kbd> to clear the filter.</p></div>`; return; }
    list.innerHTML = rows.map((r, i) => {
      const n = r.note;
      return `<div class="nrow${i === cur ? ' on' : ''}" data-id="${esc(n.id)}" role="option">` +
        `<div class="n-title"><i class="n-dot paper-${esc(n.color)}"></i><div><b>${esc(n.title || 'Untitled')}</b><span>${esc(snippet(n))}</span></div></div>` +
        `<div class="n-boards">${r.boards.map((b) => `<button class="n-board" data-a="board" data-board="${esc(b.id)}" tabindex="-1" title="Open it on ${esc(b.name)}">${icon('board')}<span>${esc(b.name)}</span></button>`).join('') || '<span class="n-noboard">on no board</span>'}<button class="nf-add" data-a="place" tabindex="-1" title="Put it on a board (A)">${icon('plus')}</button></div>` +
        `<div class="n-tags">${(n.tags || []).map((t) => Tags.chip(t, active.has(t.toLowerCase()))).join('')}<button class="nf-add" data-a="tag" tabindex="-1" title="Edit tags (T)">${n.tags && n.tags.length ? icon('edit') : '+ tag'}</button></div>` +
        `<div class="n-links">${r.out.length ? `<button data-a="out" tabindex="-1" title="Notes this one links to">→ ${r.out.length}</button>` : ''}${r.inn.length ? `<button data-a="in" tabindex="-1" title="Notes linking here">← ${r.inn.length}</button>` : ''}</div>` +
        `<div class="n-upd" title="${esc(new Date(n.updated || n.created || 0).toLocaleString())}">${esc(relTime(n.updated || n.created))}</div></div>`;
    }).join('');
    scrollCur();
  }

  function mark() {
    $$('.nrow.on', list).forEach((r) => r.classList.remove('on'));
    const r = rows[cur]; if (!r) return;
    const el = list.querySelector(`.nrow[data-id="${CSS.escape(r.note.id)}"]`);
    if (el) el.classList.add('on');
    scrollCur();
  }
  function scrollCur() { const el = list.querySelector('.nrow.on'); if (el) el.scrollIntoView({ block: 'nearest' }); }
  function move(d) { if (!rows.length) return; cur = clamp(cur + d, 0, rows.length - 1); mark(); }
  function setFilter(q) { filterInp.value = q; cur = 0; render(); }

  /* ── actions ── */
  function open(r) { App.gotoNote(r.note.id); }
  function tag(r) {
    const el = list.querySelector(`.nrow[data-id="${CSS.escape(r.note.id)}"] .n-tags`);
    if (!el) return;
    editTags(el, r.note.tags || [], (tags) => {
      if (tags && tags.join(' ') !== (r.note.tags || []).join(' ')) { r.note.tags = tags; r.note.updated = now(); Store.change('note'); }
      render();
      list.focus({ preventScroll: true });
    });
  }
  function linksMenu(r, dir, anchor) {
    const ids = dir === 'out' ? r.out : r.inn;
    const rect = anchor.getBoundingClientRect();
    Popup.open({
      x: rect.left, y: rect.bottom + 2, title: dir === 'out' ? 'Links to' : 'Linked from',
      items: ids.map((id) => { const ref = Store.noteRef(id); return ref && { id, label: ref.note.title || 'Untitled', hint: ref.board.name, icon: 'note' }; }).filter(Boolean),
      onPick: (it) => App.gotoNote(it.id),
    });
  }

  /* ── keyboard (page focused, not typing) ── */
  function key(e) {
    const k = e.key, r = rows[cur];
    if (k === 'j' || k === 'ArrowDown') { move(1); return true; }
    if (k === 'k' || k === 'ArrowUp') { move(-1); return true; }
    if (k === 'g') { cur = 0; mark(); return true; }
    if (k === 'G') { cur = rows.length - 1; mark(); return true; }
    if (k === '/') { filterInp.focus(); filterInp.select(); return true; }
    if (k === 'Escape' && filterInp.value) { setFilter(''); return true; }
    if (k === 's') { const i = COLS.findIndex(([id]) => id === sort.by); sort = { by: COLS[(i + 1) % COLS.length][0], dir: sort.dir }; ls.set('notes-sort', sort); render(); return true; }
    if (k === 'S') { sort = { by: sort.by, dir: -sort.dir }; ls.set('notes-sort', sort); render(); return true; }
    if (!r) return false;
    if (k === 'Enter' || k === 'o') { open(r); return true; }
    if (k === 't') { tag(r); return true; }
    if (k === 'b') { if (r.boards[0]) App.openTab('b:' + r.boards[0].id); return true; }
    if (k === 'a' || k === 'A') { App.addToBoard(r.note.id, list.querySelector('.nrow.on .nf-add[data-a="place"]')); return true; }
    if (k === 'Delete' || k === 'Backspace') { Board.confirmDeleteEverywhere(r.note.id).then(() => render()); return true; }
    return false;
  }

  /* select a note's row (clearing a filter that hides it) */
  function reveal(id) {
    if (!rows.some((r) => r.note.id === id)) setFilter('');
    cur = Math.max(0, rows.findIndex((r) => r.note.id === id));
    mark();
    const el = list.querySelector('.nrow.on');
    if (el) { el.classList.remove('copied'); void el.offsetWidth; el.classList.add('copied'); }
  }

  return { init, render, key, setFilter, reveal, focus: () => list && list.focus({ preventScroll: true }) };
})();
