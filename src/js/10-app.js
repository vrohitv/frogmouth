import { $, MOD, ALT, modKey, now, h, uid, esc, isTypingTarget, bus, toast, download, ls, icon, fuzzy, markPositions } from './00-util.js';
import { Bird } from './01-bird.js';
import { Editor } from './06-editor.js';
import { Store } from './03-store.js';
import { Popup, Modal } from './05-ui.js';
import { Board } from './07-board.js';
import { Secrets } from './08-secrets.js';
import { NotesList } from './08b-notes.js';
import { Palette } from './09-palette.js';

/* ── app shell: welcome, floating controls, board pills, sync, keys, commands ── */
export const App = (() => {
  let shell, welcome, boardVp, secretsEl, notesEl, menuBtn, switchEl, boardsEl, syncEl;
  const undoStack = [];

  /* ── theme ── */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    ls.set('theme', t);
  }
  setTheme(ls.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'));

  /* ── welcome ──────────────────────────────────────────────────── */
  function showWelcome(mode = 'start', env = null) {
    shell.hidden = true;
    welcome.hidden = false;
    welcome.replaceChildren();
    const bird = h('div', { class: 'w-bird' }, h('div', { class: 'w-mark' }, Bird.make('mark')), h('div', { class: 'w-word' }, Bird.make('word')));
    const card = h('div', { class: 'w-card' });
    welcome.append(h('div', { class: 'w-inner' }, bird, card));

    if (mode === 'encrypted') {
      // a vault encrypted by a pre-1.0 build: decrypt once, then it is plain JSON from here on
      const inp = h('input', { class: 'field w-pass', type: 'password', placeholder: 'Its passphrase', 'data-shy': '', autocomplete: 'current-password' });
      const err = h('p', { class: 'w-err', role: 'alert' });
      const go = async () => {
        if (!inp.value) return;
        btn.disabled = true; btn.textContent = 'Opening…';
        try {
          await Store.decryptOld(inp.value, env);
          enter();
          toast(`${Store.S.vault.file} is now plain JSON. The encrypted original is in .fm-backups.`, { timeout: 7000 });
        } catch {
          err.textContent = 'That passphrase does not open this vault.';
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          btn.disabled = false; btn.textContent = 'Open'; inp.select();
        }
      };
      const btn = h('button', { class: 'btn primary', text: 'Open', onclick: go });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      card.append(
        h('p', { class: 'w-lead', html: `<b>${esc(Store.S.vault.file)}</b> was encrypted by an earlier version of frogmouth. Enter its passphrase once to open it; from then on it is saved as plain JSON.` }),
        h('div', { class: 'w-row' }, inp, btn), err,
        h('button', { class: 'btn ghost small', text: 'Choose another vault', onclick: () => { Store.close(); showWelcome(); } }));
      setTimeout(() => inp.focus(), 50);
      return;
    }

    const actions = h('div', { class: 'w-actions' });
    card.append(h('p', { class: 'w-lead', text: 'Sticky notes and secrets, kept in one file in a folder you choose.' }), actions);
    if (Store.canPickDir()) {
      actions.append(h('button', { class: 'btn primary big', html: `${icon('folder')} Open a folder <kbd>↵</kbd>`, onclick: pickFolder }));
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
    const inp = h('input', { type: 'file', accept: '.fm,.frogmouth,application/json', style: { display: 'none' } });
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.encrypted) {
          // made by a pre-1.0 build: decrypt once into a plain vault in this tab
          const pass = await Modal.prompt(`${f.name} was encrypted by an earlier version`, '', { type: 'password', shy: true, label: 'Open', placeholder: 'Its passphrase' });
          if (!pass) return;
          Store.openMemory(null, f.name);
          await Store.decryptOld(pass, j);
          Store.setStatus('memory', 'Kept in memory');
          enter();
        } else { Store.openMemory(j.data || j, f.name); enter(); }
      } catch { toast('That file could not be read as a vault', { kind: 'warn' }); }
    };
    document.body.append(inp); inp.click();
  }

  async function openVault(dir, kind) {
    try {
      const res = await Store.openDir(dir, kind);
      if (res.encrypted) { if (res.migrated) toast(`Copied ${res.migrated.from} to ${res.migrated.to}. The old file is kept as a backup.`, { timeout: 7000 }); return showWelcome('encrypted', res.env); }
      enter();
      if (res.fresh) toast(`Created ${Store.FILE} in ${Store.S.vault.name}`);
      if (res.migrated) toast(`Copied ${res.migrated.from} to ${res.migrated.to}. The old file is kept as a backup.`, { timeout: 7000 });
    } catch (err) {
      console.error(err);
      Modal.open({ title: 'Could not open the vault', body: h('p', { text: err.message || String(err) }), actions: [{ label: 'OK', primary: true }] });
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
    delete ui.tabs; delete ui.sidebar; // from the old tabbed layout
    activate(ui.active, false);
    Bird.blink(true);
  }

  /* one view at a time: a board ('b:<id>') or 'secrets' */
  function activate(t, persist = true) {
    const ui = Store.S.data.ui;
    if (t !== 'secrets' && t !== 'notes') {
      const b = Store.board(t.slice(2));
      if (!b) return;
      ui.board = b.id;
      ui.recent = [b.id, ...(ui.recent || []).filter((id) => id !== b.id && Store.board(id))].slice(0, 40);
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
  const isSecrets = () => Store.S.data.ui.active === 'secrets';
  const isBoardView = () => Store.S.data.ui.active.startsWith('b:');
  const viewOf = () => (isBoardView() ? 'board' : Store.S.data.ui.active);
  /* the switcher's three pages; ⌥B ⌥L ⌥S, pressing a page's key again returns to the board */
  function showView(v) { activate(v === 'board' || viewOf() === v ? 'b:' + Store.S.data.ui.board : v); }
  function cycleBoard(d) {
    const bs = Store.S.data.boards;
    const i = bs.findIndex((b) => b.id === Store.S.data.ui.board);
    activate('b:' + bs[(i + d + bs.length) % bs.length].id);
  }

  /* ── floating chrome ── */
  function renderChrome() {
    if (!Store.S.data) return;
    for (const btn of switchEl.children) btn.classList.toggle('on', btn.dataset.view === viewOf());
    renderBoards();
    renderSync();
  }

  /* board pills: click to open, double-click to rename, drag to reorder, × to delete, + to add */
  /* with many boards only the recently used ones get a pill (kept in board order);
     the rest are one search away in the board picker (⌥J) */
  const MAX_PILLS = 6;
  function pillBoards() {
    const d = Store.S.data;
    if (d.boards.length <= MAX_PILLS) return d.boards;
    const keep = new Set([d.ui.board, ...(d.ui.recent || [])].filter((id) => Store.board(id)).slice(0, MAX_PILLS));
    for (const b of d.boards) { if (keep.size >= MAX_PILLS) break; keep.add(b.id); } // fill free slots in board order
    return d.boards.filter((b) => keep.has(b.id));
  }
  function renderBoards() {
    const d = Store.S.data;
    const many = d.boards.length > 1;
    const shown = pillBoards();
    const hidden = d.boards.length - shown.length;
    const pills = shown.map((b, i) => {
      const on = isBoardView() && d.ui.board === b.id;
      const pill = h('div', { class: 'board-pill' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on), draggable: 'true', 'data-id': b.id,
        title: `${b.name}${i < 9 ? `  (${ALT}${i + 1})` : ''}. Double-click to rename, drag to reorder.` },
        h('span', { class: 'bp-name', text: b.name }),
        many ? h('button', { class: 'bp-x', title: 'Delete board', 'aria-label': `Delete ${b.name}`, html: icon('x'), tabindex: '-1' }) : null);
      pill.addEventListener('click', (e) => {
        if (e.target.closest('.bp-x')) { e.stopPropagation(); deleteBoard(b.id); return; }
        if (pill.querySelector('input')) return;
        activate('b:' + b.id);
      });
      pill.addEventListener('dblclick', (e) => { if (!e.target.closest('.bp-x')) renameBoard(b.id); });
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
    hidden > 0 ? h('button', { class: 'bp-more', title: `All ${d.boards.length} boards (${ALT}J)`, html: `${icon('grid')}<span>${d.boards.length}</span>`, onclick: boardPicker }) : null,
    h('button', { class: 'bp-add', title: 'New board', 'aria-label': 'New board', html: icon('plus'), onclick: newBoard })].filter(Boolean));
    const on = boardsEl.querySelector('.board-pill.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* every board, searchable; type a new name to create one */
  function boardPicker() {
    const d = Store.S.data;
    const anchor = boardsEl.getBoundingClientRect();
    const rank = new Map((d.ui.recent || []).map((id, i) => [id, i]));
    const item = (b, m) => ({ id: b.id, label: b.name, labelHtml: m ? markPositions(b.name, m.p) : null, icon: b.id === d.ui.board && isBoardView() ? 'tick' : 'board', hint: `${b.items.length} ${b.items.length === 1 ? 'note' : 'notes'}` });
    const list = (q) => {
      q = (q || '').trim();
      const lq = q.toLowerCase();
      const out = d.boards.map((b) => { const m = fuzzy(lq, b.name.toLowerCase()); return m && { b, m }; }).filter(Boolean)
        .sort((x, y) => (lq ? y.m.s - x.m.s : (rank.has(x.b.id) ? rank.get(x.b.id) : 1e6 + d.boards.indexOf(x.b)) - (rank.has(y.b.id) ? rank.get(y.b.id) : 1e6 + d.boards.indexOf(y.b))))
        .slice(0, 200).map(({ b, m }) => item(b, lq && m));
      if (q && !d.boards.some((b) => b.name.toLowerCase() === lq)) out.push({ id: 'new', name: q, label: `Create board “${q}”`, icon: 'plus' });
      return out;
    };
    Popup.open({
      x: anchor.left, y: anchor.bottom + 6, title: `${d.boards.length} ${d.boards.length === 1 ? 'board' : 'boards'}`, input: true, placeholder: 'Find or create a board',
      items: list(''), onQuery: (q) => Popup.update(list(q)),
      onPick: (it) => {
        if (it.id !== 'new') { activate('b:' + it.id); return; }
        const b = { id: uid(), name: it.name, created: now(), items: [] };
        d.boards.push(b); Store.change('boards'); activate('b:' + b.id);
      },
    });
  }

  function appMenu() {
    const r = menuBtn.getBoundingClientRect();
    const items = [
      { id: 'theme', label: document.documentElement.dataset.theme === 'day' ? 'Dark theme' : 'Light theme', icon: 'sun' },
      Store.S.vault.kind === 'memory' ? { id: 'download', label: 'Download the vault', icon: 'down', hint: `${MOD}S` } : { id: 'download', label: 'Download a copy', icon: 'down' },
      { id: 'export', label: 'Export all secrets as JSON…', icon: 'key' },
      { id: 'keys', label: 'Keyboard shortcuts', icon: 'cmd', hint: '?' },
      { id: 'close', label: 'Close vault', icon: 'x' },
    ];
    Popup.open({
      x: r.left, y: r.bottom + 4, items,
      onPick: (it) => ({ theme: () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day'), download: downloadVault, export: Secrets.exportJson, keys: shortcuts, close: closeVault })[it.id](),
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
  function renameBoard(id) {
    const b = Store.board(id); if (!b) return;
    renderBoards();
    const pill = boardsEl.querySelector(`.board-pill[data-id="${CSS.escape(id)}"]`);
    if (!pill) return;
    const inp = h('input', { class: 'bp-input', value: b.name, spellcheck: 'false', 'aria-label': 'Board name', size: String(Math.max(6, b.name.length + 1)) });
    pill.replaceChildren(inp);
    pill.draggable = false;
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save && v && v !== b.name) { b.name = v; Store.change('boards'); }
      renderBoards();
    };
    inp.addEventListener('input', () => { inp.size = Math.max(6, inp.value.length + 1); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    inp.focus(); inp.select();
  }
  /* deleting a board removes the board and its placements; every note stays in the library */
  async function deleteBoard(id) {
    const d = Store.S.data;
    const b = Store.board(id); if (!b) return;
    if (d.boards.length === 1) { toast('A vault keeps at least one board'); return; }
    const n = b.items.length;
    if (n && !(await Modal.confirm(`Delete the board “${b.name}”?`, `Its ${n} ${n === 1 ? 'note stays' : 'notes stay'} in All notes and on any other boards. You can undo right after.`, 'Delete board'))) return;
    const i = d.boards.indexOf(b);
    d.boards.splice(i, 1);
    Store.index();
    if (d.ui.board === id) d.ui.board = d.boards[Math.min(i, d.boards.length - 1)].id;
    if (d.ui.active === 'b:' + id) activate('b:' + d.ui.board);
    Store.change('boards');
    renderChrome();
    pushUndo(`Deleted board ${b.name}. ${n ? `${n === 1 ? 'Its note is' : `Its ${n} notes are`} still in All notes.` : ''}`, () => {
      d.boards.splice(Math.min(i, d.boards.length), 0, b);
      Store.index();
      Store.change('boards');
      openTab('b:' + b.id);
    });
  }

  /* open a note where it lives: the given board, else the current board if it is
     there, else the first board it is on; a note on no board opens in All notes */
  function gotoNote(id, boardId) {
    const ref = Store.noteRef(id); if (!ref) return;
    const cur = Store.board(Store.S.data.ui.board);
    const b = (boardId && ref.boards.find((x) => x.id === boardId)) || (ref.boards.includes(cur) ? cur : ref.board);
    if (!b) { activate('notes'); NotesList.reveal(id); toast('That note is not on any board. Add it to one with “a”.'); return; }
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

  /* ── undo for deletions ── */
  function pushUndo(label, fn) {
    undoStack.push(fn);
    if (undoStack.length > 30) undoStack.shift();
    toast(label, { action: () => { const i = undoStack.lastIndexOf(fn); if (i >= 0) undoStack.splice(i, 1); fn(); }, label: `Undo` });
  }
  function undo() { const fn = undoStack.pop(); if (fn) { fn(); toast('Restored'); } }

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
      { title: 'New note', key: 'N', when: isBoard, run: () => Board.addNote(null, true) },
      { title: 'New board', run: newBoard },
      { title: 'Rename board', key: 'F2', when: isBoard, run: () => renameBoard(Store.S.data.ui.board) },
      { title: 'Delete board', when: isBoard, run: () => deleteBoard(Store.S.data.ui.board) },
      { title: 'Arrange notes', when: isBoard, run: () => Board.arrange() },
      { title: 'Fit all notes on screen', key: '⇧1', when: isBoard, run: () => Board.fit() },
      { title: 'Reset zoom to 100%', key: '0', when: isBoard, run: () => Board.zoomAt(1) },
      { title: 'Open the board', key: ALT + 'B', run: () => showView('board') },
      { title: 'List all notes', key: ALT + 'L', run: () => showView('notes') },
      { title: 'Open secrets', key: ALT + 'S', run: () => showView('secrets') },
      { title: 'Add an existing note to this board', key: 'A', when: isBoardView, run: () => Board.addExisting() },
      { title: 'Tag the selected note', key: 'T', when: () => isBoardView() && !!Board.selected(), run: () => Board.tagNote(Board.selected()) },
      { title: 'Go to board…', key: ALT + 'J', run: boardPicker },
      { title: 'Next board', key: ALT + ']', run: () => cycleBoard(1) },
      { title: 'Previous board', key: ALT + '[', run: () => cycleBoard(-1) },
      { title: 'New secret', run: () => { openTab('secrets'); Secrets.edit(null); } },
      { title: 'Export all secrets as JSON', run: () => Secrets.exportJson() },
      { title: 'Switch light / dark', run: () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day') },
      { title: 'Save now', key: MOD + 'S', when: () => Store.S.vault.kind !== 'memory', run: () => Store.saveNow.flush() },
      { title: 'Reload from disk', when: () => Store.S.vault.kind === 'dir', run: async () => { try { await Store.reloadFrom(); toast('Reloaded'); } catch { toast('Could not reload', { kind: 'warn' }); } } },
      { title: 'Download a copy of the vault', run: downloadVault },
      { title: 'Close vault', run: closeVault },
      { title: 'Keyboard shortcuts', key: '?', run: shortcuts },
    ];
  }

  function shortcuts() {
    const rows = [
      ['Everywhere', [[`${MOD}K`, 'Search notes, boards, secrets'], [`${MOD}⇧P`, 'Commands'], [`${MOD}S`, 'Save now'], [`${ALT}B ${ALT}L ${ALT}S`, 'Board, all notes, secrets'], [`${ALT}J`, 'Find or create a board'], [`${ALT}1–9`, 'Board pills 1 to 9'], [`${ALT}[  ${ALT}]`, 'Previous / next board'], [`${MOD}Z`, 'Undo a delete'], ['?', 'This list']]],
      ['Board', [['N, or double-click the board', 'New note'], ['Click, drag', 'Select, move a note'], ['Double-click a note, ↵', 'Edit it'], ['Esc', 'Stop editing / deselect'], ['Tab', 'Next note'], ['Arrows', 'Nudge note (⇧ for more)'], ['1–6', 'Note colour'], [`${MOD}D`, 'Duplicate note'], ['T', 'Tag the note'], ['A', 'Add an existing note'], ['Del, then Del or ↵', 'Remove from this board'], ['⇧Del', 'Delete the note everywhere (asks first)'], ['= − 0 ⇧1', 'Zoom in, out, 100%, fit'], ['Space-drag, wheel', 'Pan'], [`${MOD}+wheel, pinch`, 'Zoom'], ['Drag right or bottom edge', 'Resize'], [`${ALT}drag`, 'Move a note while editing']]],
      ['Note editor', [['/', 'Block menu'], ['@', 'Link a note or file'], ['# ## ###', 'Headings'], ['- 1. [] >', 'Lists, todo, quote'], ['``` lang', 'Code block'], ['`code`', 'Inline code'], [`${MOD}B ${MOD}I ${MOD}U`, 'Bold, italic, underline'], [`${MOD}E`, 'Inline code'], [`${MOD}⇧X`, 'Strikethrough'], [`${MOD}${ALT}1–3`, 'Heading level'], [`${MOD}↵`, 'Leave code block'], ['Wheel on image', 'Zoom that image']]],
      ['All notes', [['j k  ↑↓', 'Move'], ['↵', 'Open on its board'], ['b', 'Open the board'], ['t', 'Edit tags'], ['s  ⇧S', 'Next sort column, flip order'], ['/', 'Filter: text, board, tags']]],
      ['Secrets', [['j k  ↑↓', 'Move'], ['c  or  y', 'Copy value'], ['⇧C', 'Copy key name'], ['Space', 'Reveal value'], ['↵  or  e', 'Edit'], ['N', 'New secret'], ['/', 'Filter'], ['Del', 'Delete']]],
    ];
    Modal.open({
      title: 'Keyboard', wide: true, cls: 'keys',
      body: h('div', { class: 'keys-grid' }, rows.map(([t, list]) => h('section', null, h('h3', { text: t }), h('dl', null, list.map(([k, d]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: d })]))))),
      actions: [{ label: 'Close', primary: true }],
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
    // an open menu without its own text field still takes ↑ ↓ ↵ Esc
    if (Popup.isOpen() && Popup.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
    const k = e.key, mod = modKey(e);
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (mod && !e.altKey && (lower === 'k' || (lower === 'p' && !e.shiftKey))) { e.preventDefault(); Popup.close(); Palette.isOpen() ? Palette.hide() : Palette.show(); return; }
    if (mod && e.shiftKey && lower === 'p') { e.preventDefault(); Palette.show('>'); return; }
    if (mod && lower === 's') { e.preventDefault(); if (Store.S.vault.kind === 'memory') downloadVault(); else { Store.saveNow.flush(); } return; }
    if (Modal.isOpen() || Palette.isOpen()) return;
    if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); const b = pillBoards()[+e.code.slice(5) - 1]; if (b) activate('b:' + b.id); return; }
    if (e.altKey && !mod && e.code === 'KeyJ') { e.preventDefault(); boardPicker(); return; }
    if (e.altKey && !mod && e.code === 'BracketLeft') { e.preventDefault(); cycleBoard(-1); return; }
    if (e.altKey && !mod && e.code === 'BracketRight') { e.preventDefault(); cycleBoard(1); return; }
    if (e.altKey && !mod && e.code === 'KeyS') { e.preventDefault(); showView('secrets'); return; }
    if (e.altKey && !mod && e.code === 'KeyL') { e.preventDefault(); showView('notes'); return; }
    if (e.altKey && !mod && e.code === 'KeyB') { e.preventDefault(); showView('board'); return; }
    if (isTypingTarget(e.target)) return;
    if (mod && lower === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
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
      h('button', { class: 'hud-btn', 'data-view': 'board', title: `Board (${ALT}B)`, 'aria-label': 'Board', html: icon('board'), onclick: () => showView('board') }),
      h('button', { class: 'hud-btn', 'data-view': 'notes', title: `All notes, sortable (${ALT}L)`, 'aria-label': 'All notes', html: icon('list'), onclick: () => { if (viewOf() !== 'notes') showView('notes'); } }),
      h('button', { class: 'hud-btn', 'data-view': 'secrets', title: `Secrets (${ALT}S)`, 'aria-label': 'Secrets', html: icon('key'), onclick: () => { if (viewOf() !== 'secrets') showView('secrets'); } }));
    syncEl = h('button', { class: 'hud-sync', onclick: onSyncClick });
    // everything floats over the canvas; the notes get the whole screen
    const hud = h('div', { class: 'hud' },
      h('div', { class: 'hud-group hud-left' },
        h('div', { class: 'hud-pill hud-brand' },
          h('span', { class: 'hud-bird', title: 'frogmouth' }, Bird.make('mark')),
          h('span', { class: 'hud-logo', title: 'frogmouth' }, Bird.make('word')), menuBtn),
        switchEl, boardsEl),
      h('div', { class: 'hud-group' },
        h('button', { class: 'hud-pill hud-search', html: `${icon('search')}<span>Search</span><kbd>${MOD}K</kbd>`, onclick: () => Palette.show() }),
        h('div', { class: 'hud-pill hud-sync-pill' }, syncEl)));
    shell = h('div', { class: 'shell', hidden: true }, boardVp, notesEl, secretsEl, hud);
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
      if (what === 'boards') renderChrome();
      if (Store.S.data.ui.active === 'notes' && (what === 'boards' || what === 'notes')) NotesList.render();
      renderSync();
    });
    bus.on('goto-note', (id, boardId) => gotoNote(id, boardId));
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

