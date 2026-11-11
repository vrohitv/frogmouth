import { $, kb, isMac, isAltGr, modKey, now, h, uid, esc, isTypingTarget, bus, toast, download, ls, icon, fuzzy, markPositions, relTime } from './00-util.js';
import { Bird } from './01-bird.js';
import { Editor } from './06-editor.js';
import { Store } from './03-store.js';
import { Popup, Modal, inlineField } from './05-ui.js';
import { Board } from './07-board.js';
import { Draw } from './07c-draw.js';
import { Peek } from './07b-peek.js';
import { Secrets } from './08-secrets.js';
import { NotesList } from './08b-notes.js';
import { Palette } from './09-palette.js';
import { History } from './07d-history.js';
import { Export } from './07e-export.js';

/* ── app shell: welcome, floating controls, board pills, sync, keys, commands ── */
export const App = (() => {
  let shell, welcome, boardVp, secretsEl, notesEl, menuBtn, switchEl, boardsEl, syncEl, trailEl;

  /* ── theme ── */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    ls.set('theme', t);
  }
  setTheme(ls.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'));
  /* the UI accent: a calm green by default, or orange or purple. Only a choice made in
     the menu is remembered, so the default can change without overriding anyone. */
  const ACCENTS = { green: 'Green', orange: 'Orange', purple: 'Purple' };
  function setAccent(a, remember = true) {
    if (!ACCENTS[a]) a = 'green';
    document.documentElement.dataset.accent = a;
    if (remember) ls.set('ui-accent', a);
  }
  setAccent(ls.get('ui-accent', 'green'), false);

  /* ── welcome ──────────────────────────────────────────────────── */
  function showWelcome() {
    shell.hidden = true;
    welcome.hidden = false;
    welcome.replaceChildren();
    const bird = h('div', { class: 'w-bird' }, h('div', { class: 'w-mark' }, Bird.make('mark')), h('div', { class: 'w-word' }, Bird.make('word')));
    const card = h('div', { class: 'w-card' });
    welcome.append(h('div', { class: 'w-inner' }, bird, card));


    const actions = h('div', { class: 'w-actions' });
    card.append(h('p', { class: 'w-lead', text: 'Sticky notes, diagrams and secrets, kept in one file in a folder you choose.' }), actions);
    if (Store.canPickDir()) {
      actions.append(h('button', { class: 'btn primary big', html: `${icon('folder')} Open a folder <kbd>${kb('enter')}</kbd>`, onclick: pickFolder }));
      const ul = h('div', { class: 'w-recents' });
      actions.append(ul);
      Promise.race([Store.recents(), new Promise((r) => setTimeout(() => r([]), 800))]).then((rec) => {
        if (!rec.length || !ul.isConnected) return;
        ul.append(h('span', { class: 'muted small', text: 'Recent' }));
        rec.forEach((r, i) => ul.append(h('button', { class: 'btn ghost recent', html: `${icon('folder')}<span>${esc(r.name)}</span><kbd>${i + 1}</kbd>`, onclick: () => reopen(r) })));
      });
    } else {
      actions.append(h('p', { class: 'muted small', text: 'This browser cannot write to folders on disk. Use Chrome, Edge, Arc or Brave for that. Here, your vault lives in this tab; download it to keep it.' }));
    }
    const alt = h('div', { class: 'w-alt' });
    if (Store.canOPFS()) alt.append(h('button', { class: 'btn ghost', text: 'Use browser storage', title: 'Saved inside this browser profile, not in a folder', onclick: useOPFS }));
    alt.append(h('button', { class: 'btn ghost', text: 'Import a .fm file', onclick: importFile }));
    alt.append(h('button', { class: 'btn ghost', text: 'Try it without saving', onclick: () => { Store.openMemory(); enter(); } }));
    actions.append(alt);
    card.append(h('p', { class: 'w-fine', html: `This page makes no network requests. Your vault is a readable JSON file in your folder.` }));
  }

  async function pickFolder() {
    try {
      const dir = await showDirectoryPicker({ mode: 'readwrite', id: 'frogmouth' });
      await openVault(dir, 'dir');
    } catch (err) { if (err && err.name !== 'AbortError') toast(err.message || 'Could not open folder', { kind: 'warn' }); }
  }
  async function reopen(r) {
    try {
      let p = await r.handle.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') p = await r.handle.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') { toast('Permission to the folder was not granted', { kind: 'warn' }); return; }
      await openVault(r.handle, 'dir');
    } catch (err) {
      toast(`Could not reopen ${r.name}. It may have moved.`, { kind: 'warn' });
      await Store.forgetRecent(r.handle);
      showWelcome();
    }
  }
  async function useOPFS() {
    try { await openVault(await navigator.storage.getDirectory(), 'opfs'); }
    catch (err) { toast('Browser storage is unavailable here', { kind: 'warn' }); }
  }
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.fm,application/json', style: { display: 'none' } });
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      try {
        Store.openMemory(Store.parse(await f.text(), f.name), f.name);
        enter();
      } catch (err) { toast(err.message, { kind: 'warn' }); }
    };
    document.body.append(inp); inp.click();
  }

  async function openVault(dir, kind) {
    try {
      const res = await Store.openDir(dir, kind);
      enter();
      if (res.fresh) toast(`Created ${Store.FILE} in ${Store.S.vault.name}`);
    } catch (err) {
      console.error(err);
      Modal.open({ title: 'Could not open the vault', body: h('p', { text: err.message || String(err) }), actions: [{ label: 'OK', icon: 'tick', primary: true }] });
    }
  }

  /* ── entering the app ─────────────────────────────────────── */
  function enter() {
    welcome.hidden = true;
    welcome.replaceChildren();
    shell.hidden = false;
    const ui = Store.S.data.ui;
    if (!Store.board(ui.board)) ui.board = ui.active && ui.active.startsWith('b:') && Store.board(ui.active.slice(2)) ? ui.active.slice(2) : Store.S.data.boards[0].id;
    if (ui.active !== 'secrets' && ui.active !== 'notes') ui.active = 'b:' + ui.board;
    activate(ui.active, false);
    Bird.blink(true);
  }

  /* one view at a time: a board ('b:<id>') or 'secrets' */
  function activate(t, persist = true) {
    const ui = Store.S.data.ui;
    if (t !== 'secrets' && t !== 'notes') {
      const b = Store.board(t.slice(2));
      if (!b) return;
      if (!following && b.id !== ui.board) trail = []; // opened some other way: the trail of board links ends
      ui.board = b.id;
      ui.recent = [b.id, ...(ui.recent || []).filter((id) => id !== b.id && Store.board(id))].slice(0, 40);
      b.opened = now();
    }
    ui.active = t;
    Popup.close();
    boardVp.hidden = t === 'secrets' || t === 'notes';
    secretsEl.hidden = t !== 'secrets';
    notesEl.hidden = t !== 'notes';
    if (t === 'secrets') { Board.unmount(); Secrets.render(); Secrets.focus(); }
    else if (t === 'notes') { Board.unmount(); NotesList.render(); NotesList.focus(); }
    else Board.mount(Store.board(ui.board));
    renderChrome();
    if (persist) Store.change('ui');
  }
  const openTab = activate;

  /* board links in notes: following one remembers where you came from, shown as a trail
     (← Projects › Q3 Launch). Back (the arrow, a step, or Alt+Left) returns to that board,
     at the view you left. Opening a board any other way clears the trail. Not saved. */
  let trail = [], following = false;
  function walk(id) { following = true; try { activate('b:' + id); } finally { following = false; } }
  function followBoard(id) {
    const ui = Store.S.data.ui;
    Peek.close();
    if (!Store.board(id)) { toast('That board was deleted'); return; }
    if (id === ui.board && isBoardView()) return;
    const i = trail.indexOf(id);
    // a link back to a board already on the trail goes back there instead of growing a loop
    trail = i >= 0 ? trail.slice(0, i) : [...trail, ui.board];
    walk(id);
  }
  function back(i = trail.length - 1) {
    if (i < 0 || i >= trail.length) return;
    const id = trail[i];
    trail = trail.slice(0, i);
    walk(id);
  }
  function renderTrail() {
    trail = trail.filter((id) => Store.board(id));
    const cur = Store.board(Store.S.data.ui.board);
    trailEl.hidden = !trail.length || !isBoardView() || !cur;
    if (trailEl.hidden) { trailEl.replaceChildren(); return; }
    const step = (id, i) => h('button', { class: 'trail-step', text: Store.board(id).name, title: `Back to ${Store.board(id).name}`, onclick: () => back(i) });
    trailEl.replaceChildren(
      h('button', { class: 'trail-back', html: icon('down'), title: `Back to ${Store.board(trail[trail.length - 1]).name} (${kb('alt+←')})`, 'aria-label': 'Back', onclick: () => back() }),
      ...trail.flatMap((id, i) => [step(id, i), h('span', { class: 'trail-sep', text: '›' })]),
      h('span', { class: 'trail-here', text: cur.name }));
  }
  const isSecrets = () => Store.S.data.ui.active === 'secrets';
  const isBoardView = () => Store.S.data.ui.active.startsWith('b:');
  const viewOf = () => (isBoardView() ? 'board' : Store.S.data.ui.active);
  /* the switcher's three pages; Alt+B / Alt+L / Alt+S, pressing a page's key again returns to the board */
  function showView(v) { activate(v === 'board' || viewOf() === v ? 'b:' + Store.S.data.ui.board : v); }
  function cycleBoard(d) {
    const bs = Store.S.data.boards;
    const i = bs.findIndex((b) => b.id === Store.S.data.ui.board);
    activate('b:' + bs[(i + d + bs.length) % bs.length].id);
  }

  /* the current board one place left or right among the pills, like dragging its pill */
  function moveBoard(d) {
    const bs = Store.S.data.boards, i = bs.findIndex((b) => b.id === Store.S.data.ui.board), j = i + d;
    if (i < 0 || j < 0 || j >= bs.length) return;
    [bs[i], bs[j]] = [bs[j], bs[i]];
    Store.change('boards');
  }

  /* ── floating chrome ── */
  function renderChrome() {
    if (!Store.S.data) return;
    for (const btn of switchEl.children) btn.classList.toggle('on', btn.dataset.view === viewOf());
    renderBoards();
    renderTrail();
    renderSync();
  }

  /* board pills: click to open, double-click to rename, drag to reorder, × to delete, + to add */
  /* with many boards only the recently used ones get a pill (kept in board order);
     the rest are one search away in the Boards panel (Alt+J) */
  const MAX_PILLS = 6;
  function pillBoards() {
    const d = Store.S.data;
    if (d.boards.length <= MAX_PILLS) return d.boards;
    // pinned boards always get a pill; the current and recently used ones fill the rest
    const keep = new Set(d.boards.filter((b) => b.pinned).map((b) => b.id));
    for (const id of [d.ui.board, ...(d.ui.recent || [])]) { if (keep.size >= MAX_PILLS) break; if (Store.board(id)) keep.add(id); }
    for (const b of d.boards) { if (keep.size >= MAX_PILLS) break; keep.add(b.id); } // fill free slots in board order
    return d.boards.filter((b) => keep.has(b.id));
  }
  function renderBoards() {
    const d = Store.S.data;
    const shown = pillBoards();
    const hidden = d.boards.length - shown.length;
    const pills = shown.map((b, i) => {
      const on = isBoardView() && d.ui.board === b.id;
      const pill = h('div', { class: 'board-pill' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on), draggable: 'true', 'data-id': b.id,
        title: `${b.name}${i < 9 ? `  (${kb('alt+' + (i + 1))})` : ''}. Double-click to rename (F2), drag to reorder (${kb('alt+shift+[ / ]')}). Right-click for more.` },
        b.pinned ? h('span', { class: 'bp-pin', html: icon('pin'), 'aria-label': 'Pinned' }) : null,
        h('span', { class: 'bp-name', text: b.name }),
        on ? h('button', { class: 'bp-edit', title: 'Rename (F2)', 'aria-label': `Rename ${b.name}`, html: icon('edit'), tabindex: '-1' }) : null);
      pill.addEventListener('click', (e) => {
        if (e.target.closest('.bp-edit')) { e.stopPropagation(); renameBoard(b.id); return; }
        if (pill.querySelector('input')) return;
        activate('b:' + b.id);
      });
      pill.addEventListener('dblclick', (e) => { if (!e.target.closest('.bp-edit')) renameBoard(b.id); });
      // delete lives in a menu, not on a small hover target next to the name
      pill.addEventListener('contextmenu', (e) => { if (pill.querySelector('input')) return; e.preventDefault(); boardMenu(b, e.clientX, e.clientY); });
      pill.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-board', b.id); e.dataTransfer.effectAllowed = 'move'; pill.classList.add('dragging'); });
      pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
      pill.addEventListener('dragover', (e) => {
        if (!Array.from(e.dataTransfer.types).includes('text/x-board')) return;
        e.preventDefault();
        const r = pill.getBoundingClientRect();
        pill.classList.toggle('drop-before', e.clientX < r.left + r.width / 2);
        pill.classList.toggle('drop-after', e.clientX >= r.left + r.width / 2);
      });
      pill.addEventListener('dragleave', () => pill.classList.remove('drop-before', 'drop-after'));
      pill.addEventListener('drop', (e) => {
        const id = e.dataTransfer.getData('text/x-board');
        const after = pill.classList.contains('drop-after');
        pill.classList.remove('drop-before', 'drop-after');
        if (!id || id === b.id) return;
        e.preventDefault();
        const bs = d.boards, moving = bs.find((x) => x.id === id);
        bs.splice(bs.indexOf(moving), 1);
        bs.splice(bs.indexOf(b) + (after ? 1 : 0), 0, moving);
        Store.change('boards');
      });
      return pill;
    });
    // only the pills scroll; the all-boards and + buttons always stay in reach
    const scroller = h('div', { class: 'bp-scroll' }, pills);
    scroller.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    boardsEl.replaceChildren(...[scroller,
    h('button', { class: 'bp-more' + (hidden > 0 ? ' has-more' : ''), title: `All ${d.boards.length} boards: find, pin, rename, delete (${kb('alt+j')})`, html: `${icon('grid')}<span>${d.boards.length}</span>`, onclick: boardPicker }),
    h('button', { class: 'bp-add', title: 'New board', 'aria-label': 'New board', html: icon('plus'), onclick: newBoard })].filter(Boolean));
    const on = boardsEl.querySelector('.board-pill.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function togglePin(b) { if (b.pinned) delete b.pinned; else b.pinned = true; Store.change('boards'); }
  /* a pill's right-click menu */
  function boardMenu(b, x, y) {
    const items = [
      { id: 'rename', label: 'Rename', icon: 'edit', hint: 'F2' },
      { id: 'pin', label: b.pinned ? 'Unpin' : 'Pin: always keep a pill', icon: 'pin', hint: kb('alt+p') },
    ];
    if (Store.S.data.boards.length > 1) items.push({ id: 'delete', label: 'Delete board…', icon: 'x' });
    Popup.open({ x, y, title: b.name, items, onPick: (it) => ({ rename: () => renameBoard(b.id), pin: () => togglePin(b), delete: () => deleteBoard(b.id) })[it.id]() });
  }

  /* ── the Boards panel: every board, searchable, with pin / rename / delete ──
     ↑↓ move, Enter open (or create the typed name), Alt+P pin, F2 rename, Mod+Shift+Backspace delete, Esc close */
  let panel = null;
  function boardPicker() {
    if (panel) { panel.close(); return; }
    const d = Store.S.data;
    let rows = [], idx = 0, renaming = null;
    const inp = h('input', { class: 'bd-input', placeholder: 'Find a board, or type a new name', spellcheck: 'false', autocomplete: 'off' });
    const list = h('div', { class: 'bd-list', role: 'listbox' });
    const count = h('span', { class: 'bd-count' });
    const foot = h('div', { class: 'pal-foot', html: `<span><kbd>↑↓</kbd> move</span><span><kbd>${kb('enter')}</kbd> open</span><span><kbd>${kb('alt+p')}</kbd> pin</span><span><kbd>F2</kbd> rename</span><span><kbd>${kb('mod+shift+backspace')}</kbd> delete</span>` });
    const box = h('div', { class: 'pal bd-panel', role: 'dialog', 'aria-label': 'Boards' }, h('div', { class: 'pal-top', html: icon('grid') }, inp, count), list, foot);
    const el = h('div', { class: 'scrim pal-scrim' }, box);
    const close = () => { el.remove(); panel = null; };
    panel = { close };
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });

    const ago = (t) => (t ? relTime(t) : 'never opened');
    function build() {
      const q = inp.value.trim(), lq = q.toLowerCase();
      const scored = d.boards.map((b) => { const m = fuzzy(lq, b.name.toLowerCase()); return m && { b, m }; }).filter(Boolean);
      scored.sort((x, y) => (lq ? y.m.s - x.m.s : 0) || (y.b.pinned ? 1 : 0) - (x.b.pinned ? 1 : 0) || (y.b.opened || 0) - (x.b.opened || 0) || x.b.name.localeCompare(y.b.name));
      rows = scored.map(({ b, m }) => ({ b, m: lq ? m : null }));
      if (q && !d.boards.some((b) => b.name.toLowerCase() === lq)) rows.push({ create: q });
      idx = Math.min(idx, Math.max(0, rows.length - 1));
      count.textContent = q ? `${scored.length} of ${d.boards.length}` : `${d.boards.length} ${d.boards.length === 1 ? 'board' : 'boards'}`;
      paint();
    }
    // what is on a board, so it can be told apart by more than its name
    function preview(b) {
      if (!b.items.length) return 'Empty';
      const t = b.items.slice(0, 3).map((it) => { const ref = Store.noteRef(it.note); return (ref && ref.note.title) || 'Untitled'; }).join(', ');
      return t + (b.items.length > 3 ? ` +${b.items.length - 3}` : '');
    }
    const rowEl = (i) => list.querySelector(`.bd-row[data-i="${i}"]`);
    function paint() {
      const grouped = !inp.value.trim();
      let out = '', head = null;
      rows.forEach((r, i) => {
        // with nothing typed: pinned boards first, then the rest by when they were last opened
        const sec = r.create ? null : r.b.pinned ? 'Pinned' : 'Boards';
        if (grouped && sec && sec !== head && (sec === 'Pinned' || rows.some((x) => x.b && x.b.pinned))) out += `<div class="bd-head">${sec}</div>`;
        if (sec) head = sec;
        out += r.create
          ? `<div class="bd-row bd-create${i === idx ? ' on' : ''}" data-i="${i}">${icon('plus')}<span class="bd-name">Create board “${esc(r.create)}”</span></div>`
          : `<div class="bd-row${i === idx ? ' on' : ''}${r.b.id === d.ui.board && isBoardView() ? ' current' : ''}" data-i="${i}">` +
            `<button class="bd-pin${r.b.pinned ? ' pinned' : ''}" data-a="pin" tabindex="-1" title="${r.b.pinned ? 'Unpin' : 'Pin: always keep a pill'} (${kb('alt+p')})">${icon('pin')}</button>` +
            `<span class="bd-text"><span class="bd-name">${r.m ? markPositions(r.b.name, r.m.p) : esc(r.b.name)}</span><span class="bd-sub">${esc(preview(r.b))}</span></span>` +
            `<span class="bd-meta">${r.b.items.length} ${r.b.items.length === 1 ? 'note' : 'notes'}</span>` +
            `<span class="bd-meta bd-when">${esc(ago(r.b.opened))}</span>` +
            `<span class="bd-acts"><button data-a="rename" tabindex="-1" title="Rename (F2)">${icon('edit')}</button>` +
            `<button data-a="delete" tabindex="-1" title="Delete board (${kb('mod+shift+backspace')}); its notes stay in All notes">${icon('x')}</button></span></div>`;
      });
      list.innerHTML = out || '<div class="pal-empty">No boards.</div>';
      const on = rowEl(idx); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function open(r) {
      close();
      if (r.create) { const b = { id: uid(), name: r.create, created: now(), items: [] }; d.boards.push(b); Store.change('boards'); activate('b:' + b.id); }
      else activate('b:' + r.b.id);
    }
    function pin(r) { if (!r || r.create) return; togglePin(r.b); paint(); }
    function rename(r) {
      if (!r || r.create) return;
      if (renaming) renaming(true); // one rename at a time: the one in progress is kept
      const row = rowEl(rows.findIndex((x) => x.b === r.b)); if (!row) return;
      const name = row.querySelector('.bd-name');
      const ri = h('input', { class: 'bp-input bd-rename', value: r.b.name, spellcheck: 'false', 'aria-label': 'Board name' });
      name.replaceChildren(ri);
      renaming = inlineField(ri, (save) => {
        renaming = null;
        const v = ri.value.trim();
        if (save && v && v !== r.b.name) { r.b.name = v; Store.change('boards'); }
        if (panel) { build(); inp.focus(); }
      });
      ri.focus(); ri.select();
    }
    async function remove(r) {
      if (!r || r.create) return;
      await deleteBoard(r.b.id);
      if (panel) { build(); inp.focus(); }
    }

    inp.addEventListener('input', () => { idx = 0; build(); });
    inp.addEventListener('keydown', (e) => {
      const r = rows[idx];
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(rows.length - 1, idx + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (r) open(r); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.altKey && e.code === 'KeyP') { e.preventDefault(); pin(r); }
      else if (e.key === 'F2') { e.preventDefault(); rename(r); }
      else if (modKey(e) && e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); remove(r); }
      else if (e.altKey && e.code === 'KeyJ') { e.preventDefault(); close(); }
    });
    // the press keeps focus in the search field; the row acts on the click, so sliding off it cancels
    list.addEventListener('mousedown', (e) => { if (!e.target.closest('.bd-rename')) e.preventDefault(); });
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.bd-row'); if (!row || e.target.closest('.bd-rename')) return;
      const r = rows[+row.dataset.i]; idx = +row.dataset.i;
      const a = e.target.closest('[data-a]');
      if (!a) return open(r);
      if (a.dataset.a === 'pin') pin(r);
      else if (a.dataset.a === 'rename') rename(r);
      else if (a.dataset.a === 'delete') remove(r);
    });
    document.body.append(el);
    build();
    inp.focus();
  }

  /* one place for every export: the board as a picture, notes as Markdown, secrets as JSON */
  function exportMenu(r) {
    const onBoard = isBoardView();
    Popup.open({
      x: r.left, y: r.bottom + 4, title: 'Export',
      items: [
        ...(onBoard ? [{ id: 'svg', label: 'This board as SVG', icon: 'image' }, { id: 'png', label: 'This board as PNG', icon: 'image' }] : []),
        { id: 'md', label: 'Notes as Markdown', icon: 'note', hint: Store.hasFolder() ? 'into the folder' : 'one file' },
        { id: 'json', label: 'Secrets as JSON…', icon: 'key' },
      ],
      onPick: (it) => ({ svg: () => Export.saveBoard('svg'), png: () => Export.saveBoard('png'), md: () => Export.saveNotes(), json: () => Secrets.exportJson() })[it.id](),
    });
  }
  function appMenu() {
    const r = menuBtn.getBoundingClientRect();
    const items = [
      { id: 'theme', label: document.documentElement.dataset.theme === 'day' ? 'Dark theme' : 'Light theme', icon: 'sun' },
      ...Object.entries(ACCENTS).map(([k, label]) => ({ id: 'accent', accent: k, label: `${label} accent`, icon: document.documentElement.dataset.accent === k ? 'tick' : 'dot' })),
      Store.S.vault.kind === 'memory' ? { id: 'download', label: 'Download the vault', icon: 'down', hint: kb('mod+s') } : { id: 'download', label: 'Download a copy', icon: 'down' },
      { id: 'trash', label: 'Recently deleted', icon: 'trash', hint: Store.trash().length ? String(Store.trash().length) : '' },
      ...(Store.hasFolder() ? [{ id: 'backups', label: 'Restore a backup…', icon: 'undo' }] : []),
      { id: 'export', label: 'Export…', icon: 'download' },
      { id: 'keys', label: 'Keyboard shortcuts', icon: 'cmd', hint: '?' },
      { id: 'close', label: 'Close vault', icon: 'x' },
    ];
    Popup.open({
      x: r.left, y: r.bottom + 4, items,
      onPick: (it) => ({ accent: () => setAccent(it.accent), theme: () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day'), download: downloadVault, trash: trashPanel, backups: backupPanel, export: () => exportMenu(r), keys: shortcuts, close: closeVault })[it.id](),
    });
  }

  /* sync icon: a file with a tick when it is safely on disk, a struck-out file when nothing is */
  const SYNC = {
    saved: ['ok', 'fileok'], saving: ['busy', 'filedot'], unsaved: ['pending', 'filedot'],
    error: ['bad', 'filebad'], conflict: ['bad', 'filebad'], memory: ['none', 'filenone'], idle: ['none', 'filenone'],
  };
  function renderSync() {
    if (!Store.S.vault || !syncEl) return;
    const v = Store.S.vault, st = Store.S.status;
    const [cls, ic] = SYNC[st] || SYNC.idle;
    const where = v.kind === 'dir' ? `${v.name}/${v.file}` : v.kind === 'opfs' ? 'browser storage' : '';
    const tip = {
      saved: `Saved to ${where}`, saving: `Saving to ${where}…`, unsaved: `Unsaved changes, saving to ${where} shortly`,
      error: `${Store.S.statusText || 'Save failed'}. Click to retry.`, conflict: `${v.file} changed on disk. Click to choose a version.`,
    }[st] || (v.kind === 'memory' ? 'Not saved to any file. Click to download the vault.' : '');
    syncEl.className = 'hud-sync sync-' + cls;
    const label = v.kind === 'dir' ? v.name : v.kind === 'opfs' ? 'Browser storage' : 'No folder';
    syncEl.innerHTML = `<span class="sync-ic">${icon(ic)}</span><span class="sync-where">${esc(label)}</span>`;
    syncEl.title = tip;
    syncEl.setAttribute('aria-label', syncEl.title);
    const act = Store.S.data && Store.S.data.ui.active;
    document.title = (st === 'unsaved' || st === 'error' || st === 'conflict' ? '● ' : '') + (act ? (isSecrets() ? 'Secrets' : act === 'notes' ? 'Notes' : (Store.board(Store.S.data.ui.board) || {}).name) + ' — ' : '') + 'frogmouth';
  }
  function onSyncClick() {
    const st = Store.S.status;
    if (st === 'conflict') resolveConflict();
    else if (Store.S.vault.kind === 'memory') downloadVault();
    else if (st === 'error') Store.regainAccess().then((ok) => toast(ok ? 'Saved' : 'Still cannot write to the folder. Check its permissions, or download a copy from the menu.', ok ? {} : { kind: 'warn', timeout: 7000 }));
    else Store.saveNow.flush();
  }

  async function resolveConflict() {
    const v = await Modal.open({
      title: 'The vault changed on disk',
      body: h('p', { class: 'muted', text: `${Store.S.vault.file} was edited outside this tab (another window, a sync tool, or git) while you had unsaved changes here.` }),
      actions: [{ label: 'Cancel', value: null }, { label: 'Load the disk version', value: 'disk' }, { label: 'Keep mine', primary: true, value: 'mine' }],
    });
    if (v === 'disk') {
      try { await Store.reloadFrom(); toast('Loaded the disk version'); }
      catch (err) { toast(`Could not load the disk version: ${err.message}`, { kind: 'warn', timeout: 6000 }); }
    } else if (v === 'mine') { await Store.keepMine(); toast('Your version was written to disk'); }
  }

  /* ── boards ── */
  function newBoard() {
    const b = { id: uid(), name: 'New board', created: now(), items: [] };
    Store.S.data.boards.push(b);
    Store.change('boards');
    activate('b:' + b.id);
    renameBoard(b.id);
  }
  /* rename in place on the pill */
  let renamingPill = null;
  function renameBoard(id) {
    const b = Store.board(id); if (!b) return;
    if (renamingPill) renamingPill(true); // one rename at a time: the one in progress is kept
    renderBoards();
    const pill = boardsEl.querySelector(`.board-pill[data-id="${CSS.escape(id)}"]`);
    if (!pill) return;
    const inp = h('input', { class: 'bp-input', value: b.name, spellcheck: 'false', 'aria-label': 'Board name', size: String(Math.max(6, b.name.length + 1)) });
    pill.replaceChildren(inp);
    pill.draggable = false;
    const finish = (save) => {
      renamingPill = null;
      const v = inp.value.trim();
      if (save && v && v !== b.name) { b.name = v; Store.change('boards'); }
      renderBoards();
    };
    inp.addEventListener('input', () => { inp.size = Math.max(6, inp.value.length + 1); });
    renamingPill = inlineField(inp, finish);
    inp.focus(); inp.select();
  }
  /* deleting a board removes the board and its placements; every note stays in the library */
  async function deleteBoard(id) {
    const d = Store.S.data;
    const b = Store.board(id); if (!b) return;
    if (d.boards.length === 1) { toast('A vault keeps at least one board'); return; }
    const n = b.items.length, k = Store.shapes(b).length;
    // notes live on in the library; shapes belong to this board alone and go with it
    const says = [n ? `Its ${n} ${n === 1 ? 'note stays' : 'notes stay'} in All notes and on any other boards.` : '', k ? `Its ${k} ${k === 1 ? 'shape goes' : 'shapes go'} with it.` : ''].filter(Boolean).join(' ');
    if ((n || k) && !(await Modal.confirm(`Delete the board “${b.name}”?`, `${says} The board is kept in Recently deleted for 30 days.`, 'Delete board'))) return;
    const i = d.boards.indexOf(b);
    d.boards.splice(i, 1);
    const kept = Store.toTrash({ kind: 'board', board: b });
    Store.index();
    if (d.ui.board === id) d.ui.board = d.boards[Math.min(i, d.boards.length - 1)].id;
    if (d.ui.active === 'b:' + id) activate('b:' + d.ui.board);
    Store.change('boards');
    renderChrome();
    pushUndo(`Deleted board ${b.name}. It is in Recently deleted.`, () => {
      Store.dropTrash(kept.id);
      d.boards.splice(Math.min(i, d.boards.length), 0, b);
      Store.index();
      Store.change('boards');
      openTab('b:' + b.id);
    });
  }

  /* ── Recently deleted: notes and boards deleted in the last 30 days ── */
  function trashPanel() {
    const list = h('div', { class: 'trash-list' });
    const emptyB = h('button', { class: 'btn ghost danger', text: 'Empty' });
    const paint = () => {
      const all = Store.trash();
      emptyB.hidden = !all.length;
      if (!all.length) { list.innerHTML = '<p class="muted trash-empty">Nothing here. Notes and boards you delete stay here for 30 days.</p>'; return; }
      list.replaceChildren(...all.map((e) => {
        const known = e.kind === 'note' || e.kind === 'board';
        const title = e.kind === 'note' ? e.note.title || 'Untitled' : e.kind === 'board' ? e.board.name : 'Something this version cannot show';
        const where = e.kind === 'note' ? (e.places.length ? 'from ' + e.places.map((p) => (Store.board(p.board) || {}).name || 'a deleted board').join(', ') : 'was on no board')
          : e.kind === 'board' ? `board, ${e.board.items.length} ${e.board.items.length === 1 ? 'note' : 'notes'}${(e.board.shapes || []).length ? `, ${e.board.shapes.length} shapes` : ''}` : '';
        return h('div', { class: 'trash-row', 'data-id': e.id },
          h('span', { class: 'trash-ic', html: icon(e.kind === 'board' ? 'board' : 'note') }),
          h('span', { class: 'trash-text' }, h('span', { class: 'trash-title', text: title }), h('span', { class: 'trash-sub muted', text: `${where} · deleted ${relTime(e.at)}` })),
          known ? h('button', { class: 'btn ghost ic-only', 'data-a': 'restore', title: 'Restore', 'aria-label': `Restore ${title}`, html: icon('undo') }) : null,
          h('button', { class: 'btn ghost ic-only danger', 'data-a': 'forget', title: 'Delete forever', 'aria-label': `Delete ${title} forever`, html: icon('trash') }));
      }));
    };
    list.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-a]'), row = ev.target.closest('.trash-row'); if (!a || !row) return;
      const e = Store.trash().find((x) => x.id === row.dataset.id); if (!e) return;
      if (a.dataset.a === 'restore') restoreDeleted(e);
      else if (await Modal.confirm('Delete forever?', `“${row.querySelector('.trash-title').textContent}” will be gone for good. This cannot be undone.`, 'Delete forever')) { Store.dropTrash(e.id); Store.change('trash'); }
      paint();
    });
    emptyB.addEventListener('click', async () => {
      const k = Store.trash().length;
      if (!(await Modal.confirm(`Delete ${k} ${k === 1 ? 'thing' : 'things'} forever?`, 'Everything in Recently deleted will be gone for good. This cannot be undone.', 'Empty'))) return;
      delete Store.S.data.trash; Store.change('trash'); paint();
    });
    paint();
    Modal.open({ title: 'Recently deleted', wide: true, cls: 'trash', body: h('div', null, list, h('p', { class: 'muted small', text: 'Secrets are not kept here: a deleted secret is gone once the vault saves.' })),
      actions: [{ label: 'Close', icon: 'x', value: null }] }).then(() => {});
    // the Empty button sits with the dialog's own buttons
    const acts = document.querySelector('.modal.trash .modal-actions'); if (acts) acts.prepend(emptyB);
  }
  function restoreDeleted(e) {
    const out = Store.restoreTrash(e.id); if (!out) return;
    const title = e.kind === 'note' ? e.note.title || 'Untitled' : e.board.name;
    const where = e.kind === 'note' ? (out.boards.length ? ` to ${out.boards.map((b) => b.name).join(', ')}` : ' to All notes') : '';
    if (Board.current()) Board.refresh();
    Store.change(e.kind === 'board' ? 'boards' : 'notes');
    pushUndo(`Restored “${title.slice(0, 28)}”${where}`, () => {
      Store.reTrash(out);
      if (e.kind === 'board' && Store.S.data.ui.board === out.board.id) activate('b:' + Store.S.data.boards[0].id);
      else if (Board.current()) Board.refresh();
      Store.change(e.kind === 'board' ? 'boards' : 'notes');
    });
  }

  /* ── Restore a backup: every copy in .fm-backups, newest first; pick one to see what is in it ── */
  async function backupPanel() {
    const all = await Store.listBackups();
    const KIND = { daily: 'Daily copy', hourly: 'Snapshot', before: 'Before a restore' };
    const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
    const list = h('div', { class: 'backup-list', role: 'listbox' });
    const preview = h('div', { class: 'backup-preview muted', text: all.length ? 'Pick a version to see what is in it.' : '' });
    if (!all.length) list.append(h('p', { class: 'muted trash-empty', text: 'No backups yet. A copy is made each day the vault is opened, and a snapshot every hour while you edit.' }));
    for (const b of all) list.append(h('button', { class: 'backup-row', 'data-name': b.name, role: 'option' }, h('span', { class: 'backup-when', text: when(b.at) }), h('span', { class: 'backup-kind muted', text: KIND[b.kind] })));
    let close = null;
    list.addEventListener('click', async (e) => {
      const row = e.target.closest('.backup-row'); if (!row) return;
      for (const r of list.querySelectorAll('.backup-row.on')) r.classList.remove('on');
      row.classList.add('on');
      const name = row.dataset.name;
      try {
        const j = JSON.parse(await Store.readBackup(name)), d = (j && j.data) || {};
        const count = (k, one, many) => { const n = Array.isArray(d[k]) ? d[k].length : 0; return `${n} ${n === 1 ? one : many}`; };
        const go = h('button', { class: 'btn primary', 'data-a': 'restore', html: `${icon('undo')} Restore this version` });
        go.addEventListener('click', async () => {
          if (!(await Modal.confirm('Restore this version?', 'It replaces what is open now. What is open now is saved as a backup first, and you can undo right after.', 'Restore', false, 'undo'))) return;
          try {
            const was = await Store.restoreBackup(name);
            if (close) close();
            pushUndo(`Restored the version from ${when(all.find((x) => x.name === name).at)}`, () => Store.useData(was));
          } catch (err) { toast(err.message, { kind: 'warn', timeout: 7000 }); }
        });
        preview.classList.remove('muted');
        preview.replaceChildren(h('p', { text: `${count('notes', 'note', 'notes')} · ${count('boards', 'board', 'boards')} · ${count('secrets', 'secret', 'secrets')}${j.saved ? ` · saved ${when(Date.parse(j.saved))}` : ''}` }), go);
      } catch { preview.classList.add('muted'); preview.textContent = 'This file cannot be read as a vault.'; }
    });
    Modal.open({ title: 'Restore a backup', wide: true, cls: 'backups', body: (done) => { close = () => done(null); return h('div', null, list, preview); }, actions: [{ label: 'Close', icon: 'x', value: null }] });
  }

  /* open a note where it lives: the given board, else the current board if it is
     there, else the first board it is on; a note on no board opens in All notes */
  function gotoNote(id, boardId) {
    const ref = Store.noteRef(id); if (!ref) return;
    const cur = Store.board(Store.S.data.ui.board);
    const b = (boardId && ref.boards.find((x) => x.id === boardId)) || (ref.boards.includes(cur) ? cur : ref.board);
    // a note on no board has nowhere to go: it opens in the note view, which can add it to this board
    if (!b) { Peek.open(id); return; }
    Peek.close();
    openTab('b:' + b.id);
    requestAnimationFrame(() => Board.center(id));
  }

  /* put a library note on a board of your choice */
  function addToBoard(noteId, anchor) {
    const ref = Store.noteRef(noteId); if (!ref) return;
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 150, bottom: 120 };
    const items = Store.S.data.boards.map((b) => ({ id: b.id, label: b.name, icon: ref.boards.includes(b) ? 'tick' : 'board', hint: ref.boards.includes(b) ? 'already there' : '' }));
    items.push({ id: 'new', label: 'New board…', icon: 'plus' });
    Popup.open({
      x: r.left, y: r.bottom + 2, title: `Put “${(ref.note.title || 'Untitled').slice(0, 24)}” on`, items,
      onPick: (it) => {
        if (it.id === 'new') {
          const b = { id: uid(), name: 'New board', created: now(), items: [] };
          Store.S.data.boards.push(b); Store.change('boards');
          activate('b:' + b.id); Board.placeExisting(noteId); renameBoard(b.id);
          return;
        }
        activate('b:' + it.id);
        Board.placeExisting(noteId);
      },
    });
  }

  /* ── undo: deletions push a closure that puts things back (07d-history.js) ── */
  const pushUndo = (label, fn) => History.push(label, fn);

  async function downloadVault() {
    const text = await Store.serialize();
    download(Store.S.vault.kind === 'memory' && /\.fm$/.test(Store.S.vault.name) ? Store.S.vault.name : Store.FILE, text);
    if (Store.S.vault.kind === 'memory') { Store.S.dirty = false; Store.setStatus('memory', 'Downloaded'); }
  }

  async function closeVault() {
    if (Store.S.dirty && Store.S.vault.kind !== 'memory') await Store.save();
    if (Store.S.dirty && Store.S.vault.kind === 'memory' && !(await Modal.confirm('Close without downloading?', 'This vault only exists in this tab.', 'Close anyway'))) return;
    Board.unmount();
    Store.close();
    showWelcome();
  }

  /* ── commands ── */
  const isBoard = () => Store.S.data && Store.S.data.ui.active !== 'secrets';
  function commands() {
    return [
      { title: 'Undo', key: kb('mod+z'), run: () => History.undo() },
      { title: 'Redo', key: kb('mod+shift+z'), run: () => History.redo() },
      { title: 'New note', key: 'N', when: isBoard, run: () => Board.addNote(null, true) },
      { title: 'New board', run: newBoard },
      { title: 'Rename board', key: 'F2', when: isBoard, run: () => renameBoard(Store.S.data.ui.board) },
      { title: 'Delete board', when: isBoard, run: () => deleteBoard(Store.S.data.ui.board) },
      { title: 'Arrange notes', when: isBoard, run: () => Board.arrange() },
      { title: 'Duplicate the selection', key: kb('mod+d'), when: () => isBoardView() && Board.selection().length > 0, run: () => Board.duplicate(Board.selection()) },
      { title: 'Find on this board', key: kb('mod+f'), when: isBoardView, run: () => Board.find() },
      { title: 'Select every note on this board', key: kb('mod+a'), when: isBoardView, run: () => Board.selectAll() },
      { title: 'Fit all notes on screen', key: kb('shift+1'), when: isBoard, run: () => Board.fit() },
      { title: 'Reset zoom to 100%', key: '0', when: isBoard, run: () => Board.zoomAt(1) },
      { title: 'Open the board', key: kb('alt+b'), run: () => showView('board') },
      { title: 'List all notes', key: kb('alt+l'), run: () => showView('notes') },
      { title: 'Open secrets', key: kb('alt+s'), run: () => showView('secrets') },
      { title: 'Add an existing note to this board', key: 'A', when: isBoardView, run: () => Board.addExisting() },
      ...[['Draw a rectangle', 'R', 'rect'], ['Draw an ellipse', 'O', 'ellipse'], ['Draw a diamond', 'D', 'diamond'], ['Add text', 'X', 'text'],
        ['Draw a line', 'L', 'line'], ['Draw an arrow', 'C', 'arrow'], ['Draw a frame', 'F', 'frame']].map(([title, key, t]) => ({ title, key, when: isBoardView, run: () => Draw.setTool(t) })),
      { title: 'Tag the selected note', key: 'T', when: () => isBoardView() && !!Board.selected(), run: () => Board.tagNote(Board.selected()) },
      { title: 'Boards: find, pin, rename, delete…', key: kb('alt+j'), run: boardPicker },
      { title: 'Next board', key: kb('alt+]'), run: () => cycleBoard(1) },
      { title: 'Previous board', key: kb('alt+['), run: () => cycleBoard(-1) },
      { title: 'Move this board left', key: kb('alt+shift+['), when: isBoardView, run: () => moveBoard(-1) },
      { title: 'Move this board right', key: kb('alt+shift+]'), when: isBoardView, run: () => moveBoard(1) },
      { title: 'New secret', run: () => { openTab('secrets'); Secrets.edit(null); } },
      { title: 'Export this board as SVG', when: isBoardView, run: () => Export.saveBoard('svg') },
      { title: 'Export this board as PNG', when: isBoardView, run: () => Export.saveBoard('png') },
      { title: 'Export notes as Markdown', run: () => Export.saveNotes() },
      { title: 'Export all secrets as JSON', run: () => Secrets.exportJson() },
      ...Object.entries(ACCENTS).map(([k, label]) => ({ title: `Accent colour: ${label}`, run: () => setAccent(k) })),
      { title: 'Switch light / dark', run: () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day') },
      { title: 'Save now', key: kb('mod+s'), when: () => Store.S.vault.kind !== 'memory', run: () => Store.saveNow.flush() },
      { title: 'Reload from disk', when: () => Store.S.vault.kind !== 'memory', run: async () => { try { await Store.reloadFrom(); toast('Reloaded'); } catch { toast('Could not reload', { kind: 'warn' }); } } },
      { title: 'Recently deleted', run: trashPanel },
      { title: 'Restore a backup…', when: () => Store.hasFolder(), run: backupPanel },
      { title: 'Download a copy of the vault', run: downloadVault },
      { title: 'Close vault', run: closeVault },
      { title: 'Keyboard shortcuts', key: '?', run: shortcuts },
    ];
  }

  function shortcuts() {
    const rows = [
      ['Everywhere', [[kb('mod+k'), 'Search notes, boards, secrets'], [kb('mod+shift+p'), 'Commands'], [kb('mod+s'), 'Save now'], [kb('alt+b / alt+l / alt+s'), 'Board, all notes, secrets'], [kb('alt+j'), 'Boards panel: find, pin, rename, delete, create'], [kb('alt+1') + '–9', 'Board pills 1 to 9'], [kb('alt+[ / alt+]'), 'Previous / next board'], [kb('alt+shift+[ / ]'), 'Move this board left / right'], ['F2', 'Rename this board'], [kb('mod+z'), 'Undo'], [kb('mod+shift+z') + ' / ' + kb('mod+y'), 'Redo'], [kb('alt+←'), 'Back along board links'], ['?', 'This list']]],
      ['Board', [['N / double-click', 'New note'], ['Click, drag', 'Select, move a note'], [kb('shift+click'), 'Add to the selection'], [kb('shift+drag'), 'Select with a box'], [kb('mod+a'), 'Select every note'], [kb('mod+f'), 'Find in every note'], ['Double-click, ' + kb('enter'), 'Edit a note'], ['Esc', 'Stop editing / deselect'], ['Tab', 'Next note'], ['Arrows', `Nudge (${kb('shift')} for more)`], [kb('alt+shift') + ' arrows', 'Resize'], ['1–9', 'Colour'], [kb('mod+c / mod+x / mod+v'), 'Copy, cut, paste: lines and frame contents come along'], [kb('mod+d'), 'Duplicate'], ['T', 'Tag the note'], ['B', 'Notes that link here'], ['A', 'Add an existing note'], ['Del Del', 'Remove from this board'], [kb('shift+del'), 'Delete everywhere (asks first)'], ['= − 0 ' + kb('shift+1'), 'Zoom in, out, 100%, fit'], ['M', 'Show or hide the minimap'], ['Space+drag, wheel', 'Pan'], [kb('mod+wheel') + ', pinch', 'Zoom'], ['Drag an edge', 'Resize'], [kb('alt+drag'), 'Move a note while editing']]],
      ['Drawing', [['V / Esc', 'Select'], ['R O D', 'Rectangle, ellipse, diamond'], ['X', 'Text'], ['L / C', 'Line / arrow'], ['F', 'Frame'], ['Drag / click', 'Draw / default size'], ['Double-click, ' + kb('enter'), 'Edit the text or label'], ['Drag a side dot', 'Connect with an arrow'], ['Drag a line end', 'Attach it elsewhere'], ['[ ]', 'Send to back / bring to front'], ['1–9', 'Colour'], ['Del', 'Delete (undo with ' + kb('mod+z') + ')']]],
      ['Note editor', [['/', 'Block menu'], ['@', 'Link a note, board or file'], ['@@', 'Link a board'], ['# ## ###', 'Headings'], ['- 1. [] >', 'Lists, todo, quote'], [kb('mod+enter'), 'Tick a todo item'], ['``` lang', 'Code block'], ['/table 4x3', 'Table'], [kb('tab') + ' ' + kb('enter'), 'Next cell, cell below'], [kb('mod+enter'), 'Leave a table or code block'], ['`code`', 'Inline code'], [kb('mod+b / mod+i / mod+u'), 'Bold, italic, underline'], [kb('mod+e'), 'Inline code'], [kb('mod+shift+x'), 'Strikethrough'], [kb(isMac ? 'mod+alt+1' : 'mod+shift+1') + '–3', 'Heading level'], ['Wheel on image', 'Zoom that image']]],
      ['All notes', [['j k  ↑↓', 'Move'], [kb('enter'), 'Open on its board'], ['b', 'Open the board'], ['t', 'Edit tags'], ['s / ' + kb('shift+s'), 'Next sort column, flip order'], ['/', 'Filter: text, board, tags']]],
      ['Secrets', [['j k  ↑↓', 'Move'], ['c  or  y', 'Copy value'], [kb('shift+c'), 'Copy key name'], ['Space', 'Reveal value'], [kb('enter') + '  or  e', 'Edit'], ['N', 'New secret'], ['/', 'Filter'], ['Del', 'Delete (confirmed three times)']]],
    ];
    Modal.open({
      title: 'Keyboard', wide: true, cls: 'keys',
      body: h('div', { class: 'keys-grid' }, rows.map(([t, list]) => h('section', null, h('h3', { text: t }), h('dl', null, list.map(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]))))),
      actions: [{ label: 'Close', icon: 'x', primary: true }],
    });
  }

  /* ── keyboard routing ── */
  function onKey(e) {
    if (!Store.S.data) {
      if (welcome.hidden || isTypingTarget(e.target) || Modal.isOpen()) return;
      if (e.key === 'Enter' && Store.canPickDir()) { e.preventDefault(); pickFolder(); }
      if (/^[1-6]$/.test(e.key)) { const b = welcome.querySelectorAll('.recent')[+e.key - 1]; if (b) b.click(); }
      return;
    }
    if (isAltGr(e)) return;
    // an open menu without its own text field still takes arrow keys, Enter and Esc
    if (Popup.isOpen() && Popup.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
    const k = e.key, mod = modKey(e);
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (mod && !e.altKey && (lower === 'k' || (lower === 'p' && !e.shiftKey))) { e.preventDefault(); Popup.close(); Palette.isOpen() ? Palette.hide() : Palette.show(); return; }
    if (mod && e.shiftKey && lower === 'p') { e.preventDefault(); Palette.show('>'); return; }
    if (mod && lower === 's') { e.preventDefault(); if (Store.S.vault.kind === 'memory') downloadVault(); else { Store.saveNow.flush(); } return; }
    if (Modal.isOpen() || Palette.isOpen() || panel) return;
    // find: on a board every note's text, on the other pages their filter field
    if (mod && !e.shiftKey && !e.altKey && lower === 'f') {
      e.preventDefault();
      const act = Store.S.data.ui.active;
      if (act === 'secrets') Secrets.key({ key: '/' }); else if (act === 'notes') NotesList.key({ key: '/' }); else Board.find();
      return;
    }
    if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); const b = pillBoards()[+e.code.slice(5) - 1]; if (b) activate('b:' + b.id); return; }
    if (e.altKey && !mod && e.code === 'KeyJ') { e.preventDefault(); boardPicker(); return; }
    if (e.altKey && e.shiftKey && !mod && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { e.preventDefault(); moveBoard(e.code === 'BracketLeft' ? -1 : 1); return; }
    if (e.altKey && !mod && e.code === 'BracketLeft') { e.preventDefault(); cycleBoard(-1); return; }
    if (e.altKey && !mod && e.code === 'BracketRight') { e.preventDefault(); cycleBoard(1); return; }
    if (e.altKey && !mod && e.code === 'KeyS') { e.preventDefault(); showView('secrets'); return; }
    if (e.altKey && !mod && e.code === 'KeyL') { e.preventDefault(); showView('notes'); return; }
    if (e.altKey && !mod && e.code === 'KeyB') { e.preventDefault(); showView('board'); return; }
    if (isTypingTarget(e.target)) return;
    if (e.altKey && !mod && !e.shiftKey && k === 'ArrowLeft' && trail.length && isBoardView()) { e.preventDefault(); back(); return; }
    if (mod && lower === 'z') { e.preventDefault(); if (e.shiftKey) History.redo(); else History.undo(); return; }
    if (mod && lower === 'y' && !e.shiftKey) { e.preventDefault(); History.redo(); return; }
    if (k === '?') { e.preventDefault(); shortcuts(); return; }
    if (k === 'F2' && isBoard()) { e.preventDefault(); renameBoard(Store.S.data.ui.board); return; }
    if (e.target.closest && e.target.closest('.hud')) return;
    if (e.altKey && !e.shiftKey) return;
    const act = Store.S.data.ui.active;
    const handled = act === 'secrets' ? Secrets.key(e) : act === 'notes' ? NotesList.key(e) : Board.key(e);
    if (handled) e.preventDefault();
  }

  /* ── boot ── */
  function boot() {
    const app = $('#app');
    welcome = h('div', { class: 'welcome' });
    boardVp = h('div', { class: 'board-vp', hidden: true });
    secretsEl = h('div', { class: 'secrets page', hidden: true });
    notesEl = h('div', { class: 'notes-page page', hidden: true });
    menuBtn = h('button', { class: 'hud-menu', title: 'Theme, export, shortcuts', 'aria-label': 'App menu', html: icon('down'), onclick: appMenu });
    boardsEl = h('div', { class: 'hud-pill hud-boards', role: 'tablist', 'aria-label': 'Boards' });
    switchEl = h('div', { class: 'hud-pill hud-switch', role: 'group', 'aria-label': 'Notes or secrets' },
      h('button', { class: 'hud-btn', 'data-view': 'board', title: `Board (${kb('alt+b')})`, 'aria-label': 'Board', html: icon('board'), onclick: () => showView('board') }),
      h('button', { class: 'hud-btn', 'data-view': 'notes', title: `All notes, sortable (${kb('alt+l')})`, 'aria-label': 'All notes', html: icon('list'), onclick: () => { if (viewOf() !== 'notes') showView('notes'); } }),
      h('button', { class: 'hud-btn', 'data-view': 'secrets', title: `Secrets (${kb('alt+s')})`, 'aria-label': 'Secrets', html: icon('key'), onclick: () => { if (viewOf() !== 'secrets') showView('secrets'); } }));
    syncEl = h('button', { class: 'hud-sync', onclick: onSyncClick });
    // everything floats over the canvas; the notes get the whole screen
    const hud = h('div', { class: 'hud' },
      h('div', { class: 'hud-group hud-left' },
        h('div', { class: 'hud-pill hud-brand' },
          h('span', { class: 'hud-bird', title: 'frogmouth' }, Bird.make('mark')),
          h('span', { class: 'hud-logo', title: 'frogmouth' }, Bird.make('word')), menuBtn),
        switchEl, boardsEl),
      h('div', { class: 'hud-group' },
        h('button', { class: 'hud-pill hud-search', title: `Search notes, boards, secrets (${kb('mod+k')})`, 'aria-label': 'Search', html: icon('search'), onclick: () => Palette.show() }),
        h('div', { class: 'hud-pill hud-sync-pill' }, syncEl)));
    trailEl = h('nav', { class: 'hud-trail', hidden: true, 'aria-label': 'Boards you came through' });
    shell = h('div', { class: 'shell', hidden: true }, boardVp, notesEl, secretsEl, hud, trailEl);
    app.append(welcome, shell, h('div', { id: 'toasts', 'aria-live': 'polite' }));
    Board.init(boardVp);
    Secrets.init(secretsEl);
    NotesList.init(notesEl);
    addEventListener('keydown', onKey);
    // anything that fails in the background gets said out loud instead of failing silently
    const oops = (err) => {
      console.error(err);
      const msg = (err && (err.message || String(err))) || 'Unknown error';
      if (!/ResizeObserver loop|AbortError|The user aborted/.test(msg)) toast(`Something went wrong: ${msg.slice(0, 120)}`, { kind: 'warn', timeout: 7000 });
    };
    addEventListener('unhandledrejection', (e) => oops(e.reason));
    addEventListener('error', (e) => oops(e.error || e.message));
    bus.on('status', renderSync);
    bus.on('change', (what) => {
      if (what === 'secrets') Board.refreshChips();
      if (what === 'boards') { renderChrome(); Board.refreshChips(); }
      if (Store.S.data.ui.active === 'notes' && (what === 'boards' || what === 'notes')) NotesList.render();
      renderSync();
    });
    bus.on('goto-note', (id, boardId) => gotoNote(id, boardId));
    bus.on('goto-board', followBoard);
    bus.on('open-note', (id) => Peek.open(id, true));
    bus.on('closed', () => { trail = []; });
    bus.on('reloaded', () => { if (Store.S.data && !shell.hidden) enter(); });
    bus.on('filter-notes', (tag) => { activate('notes'); NotesList.setFilter(tag + ' '); });
    addEventListener('beforeunload', (e) => {
      Editor.flush();
      if (!Store.S.data || !Store.S.dirty) return;
      if (Store.S.vault.kind !== 'memory') Store.saveNow.flush();
      e.preventDefault(); e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) Editor.flush(); if (document.hidden && Store.S.dirty && Store.S.vault && Store.S.vault.kind !== 'memory') Store.saveNow.flush(); });
    showWelcome();
  }

  return { boot, openTab, gotoNote, addToBoard, pushUndo, commands, enter, showWelcome };
})();

