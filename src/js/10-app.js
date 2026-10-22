/* ── app shell: welcome, tabs, explorer, status bar, keys, commands ── */
const App = (() => {
  let shell, welcome, tabsEl, side, boardVp, secretsEl, viewEmpty, statusEl;
  const undoStack = [];
  let lastActivity = now();

  /* ── theme ── */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    ls.set('theme', t);
  }
  setTheme(ls.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'));

  /* ── welcome / unlock ───────────────────────────────────────── */
  function showWelcome(mode = 'start', env = null) {
    shell.hidden = true;
    welcome.hidden = false;
    welcome.replaceChildren();
    const bird = h('div', { class: 'w-bird' }, Bird.make('big'));
    const card = h('div', { class: 'w-card' });
    welcome.append(h('div', { class: 'w-inner' }, bird, card));

    if (mode === 'locked') {
      const inp = h('input', { class: 'field w-pass', type: 'password', placeholder: 'Passphrase', 'data-shy': '', autocomplete: 'current-password' });
      const err = h('p', { class: 'w-err', role: 'alert' });
      const go = async () => {
        if (!inp.value) return;
        btn.disabled = true; btn.textContent = 'Unlocking…';
        try {
          await Store.unlock(inp.value, env);
          enter();
        } catch {
          err.textContent = 'That passphrase does not open this vault.';
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          btn.disabled = false; btn.textContent = 'Unlock'; inp.select();
        }
      };
      const btn = h('button', { class: 'btn primary', text: 'Unlock', onclick: go });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      card.append(
        h('p', { class: 'w-lead', html: `<b>${esc(Store.S.vault.file)}</b> in ${esc(Store.S.vault.name)} is locked.` }),
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
    alt.append(h('button', { class: 'btn ghost', text: 'Import a .frogmouth file', onclick: importFile }));
    alt.append(h('button', { class: 'btn ghost', text: 'Try it without saving', onclick: () => { Store.openMemory(); enter(); } }));
    actions.append(alt);
    card.append(h('p', { class: 'w-fine', html: `This page makes no network requests. The vault is readable JSON unless you set a passphrase (AES-256).` }));
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
    const inp = h('input', { type: 'file', accept: '.frogmouth,application/json', style: { display: 'none' } });
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.encrypted) {
          Store.S.vault = { kind: 'memory', name: f.name, file: f.name };
          const pass = await Modal.prompt('Passphrase for ' + f.name, '', { type: 'password', shy: true, label: 'Unlock' });
          if (!pass) return;
          await Store.unlock(pass, j);
          Store.S.vault = { kind: 'memory', name: f.name, file: f.name };
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
      if (res.locked) return showWelcome('locked', res.env);
      enter();
      if (res.fresh) toast(`Created ${Store.FILE} in ${Store.S.vault.name}`);
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
    ui.tabs = ui.tabs.filter((t) => t === 'secrets' || Store.board(t.slice(2)));
    if (!ui.tabs.length) ui.tabs.push('b:' + Store.S.data.boards[0].id);
    if (!ui.tabs.includes(ui.active)) ui.active = ui.tabs[0];
    if (innerWidth < 760) ui.sidebar = false;
    shell.classList.toggle('no-side', !ui.sidebar);
    renderAll();
    activate(ui.active, false);
    Bird.blink(true);
  }

  function renderAll() { renderTabs(); renderSide(); renderStatus(); }

  /* ── tabs ── */
  const tabLabel = (t) => (t === 'secrets' ? 'Secrets' : (Store.board(t.slice(2)) || {}).name || '?');
  function renderTabs() {
    const ui = Store.S.data.ui;
    tabsEl.replaceChildren(...ui.tabs.map((t, i) => {
      const el = h('div', { class: 'tab' + (t === ui.active ? ' on' : ''), role: 'tab', 'aria-selected': String(t === ui.active), title: i < 9 ? `${ALT}${i + 1}` : '' },
        h('span', { class: 'tab-ic', html: icon(t === 'secrets' ? 'key' : 'board') }),
        h('span', { class: 'tab-name', text: tabLabel(t) }),
        h('button', { class: 'tab-x', title: `Close (${ALT}W)`, html: icon('x'), tabindex: '-1' }));
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) { e.preventDefault(); closeTab(t); return; }
        if (e.target.closest('.tab-x')) { e.preventDefault(); closeTab(t); return; }
        activate(t);
      });
      el.addEventListener('dblclick', () => { if (t !== 'secrets') renameBoard(t.slice(2)); });
      return el;
    }));
    const on = tabsEl.querySelector('.tab.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function openTab(t) {
    const ui = Store.S.data.ui;
    if (!ui.tabs.includes(t)) {
      const i = ui.tabs.indexOf(ui.active);
      ui.tabs.splice(i + 1, 0, t);
    }
    activate(t);
  }
  function activate(t, persist = true) {
    const ui = Store.S.data.ui;
    if (!ui.tabs.includes(t)) return;
    ui.active = t;
    renderTabs();
    boardVp.hidden = true; secretsEl.hidden = true; viewEmpty.hidden = true;
    Popup.close();
    if (t === 'secrets') {
      Board.unmount();
      secretsEl.hidden = false;
      Secrets.render();
      Secrets.focus();
    } else {
      const b = Store.board(t.slice(2));
      boardVp.hidden = false;
      Board.mount(b);
    }
    renderSide();
    renderStatus();
    if (persist) Store.change('ui');
  }
  function closeTab(t) {
    const ui = Store.S.data.ui;
    const i = ui.tabs.indexOf(t); if (i < 0) return;
    ui.tabs.splice(i, 1);
    if (ui.active === t) {
      if (ui.tabs.length) activate(ui.tabs[Math.max(0, i - 1)]);
      else { ui.active = null; Board.unmount(); boardVp.hidden = true; secretsEl.hidden = true; viewEmpty.hidden = false; renderTabs(); renderSide(); }
    } else renderTabs();
    Store.change('ui');
  }
  function cycleTab(d) {
    const ui = Store.S.data.ui; if (!ui.tabs.length) return;
    const i = ui.tabs.indexOf(ui.active);
    activate(ui.tabs[(i + d + ui.tabs.length) % ui.tabs.length]);
  }

  /* ── explorer ── */
  function renderSide() {
    if (!Store.S.data) return;
    const d = Store.S.data, act = d.ui.active;
    const boards = h('div', { class: 'side-list' }, d.boards.map((b) => {
      const el = h('div', { class: 'side-item' + (act === 'b:' + b.id ? ' on' : ''), tabindex: '0' },
        h('span', { html: icon('board') }), h('span', { class: 'si-name', text: b.name }), h('span', { class: 'si-n', text: b.notes.length || '' }),
        h('button', { class: 'si-act', title: 'Rename (F2)', html: icon('edit'), tabindex: '-1', onclick: (e) => { e.stopPropagation(); renameBoard(b.id); } }),
        h('button', { class: 'si-act', title: 'Delete board', html: icon('trash'), tabindex: '-1', onclick: (e) => { e.stopPropagation(); deleteBoard(b.id); } }));
      el.addEventListener('click', () => openTab('b:' + b.id));
      el.addEventListener('dblclick', () => renameBoard(b.id));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTab('b:' + b.id); if (e.key === 'F2') renameBoard(b.id); });
      return el;
    }));
    const sec = h('div', { class: 'side-item' + (act === 'secrets' ? ' on' : ''), tabindex: '0' },
      h('span', { html: icon('key') }), h('span', { class: 'si-name', text: 'All secrets' }), h('span', { class: 'si-n', text: d.secrets.length || '' }));
    sec.addEventListener('click', () => { openTab('secrets'); Secrets.setFilter(''); });
    sec.addEventListener('keydown', (e) => { if (e.key === 'Enter') sec.click(); });
    const tags = h('div', { class: 'side-tags' });
    for (const [k, info] of Secrets.tagStats()) {
      const row = h('div', { class: 'tag-row' },
        h('button', { class: 'tag-k', html: `${icon('tag')}<span>${esc(k)}</span><i>${info.n}</i>`, onclick: () => { openTab('secrets'); Secrets.setFilter(info.vals.size ? k + ': ' : k + ' '); } }));
      if (info.vals.size) {
        row.append(h('div', { class: 'tag-vals' }, [...info.vals].sort().map(([v, n]) =>
          h('button', { class: 'tag-v', html: `<span>${esc(v)}</span><i>${n}</i>`, onclick: () => { openTab('secrets'); Secrets.setFilter(`${k}:${v} `); } }))));
      }
      tags.append(row);
    }
    side.replaceChildren(
      h('div', { class: 'side-sec' },
        h('div', { class: 'side-h' }, h('span', { text: 'Boards' }), h('button', { class: 'icon-btn', title: 'New board', html: icon('plus'), onclick: newBoard })),
        boards),
      h('div', { class: 'side-sec' }, h('div', { class: 'side-h' }, h('span', { text: 'Secrets' }), h('button', { class: 'icon-btn', title: 'New secret', html: icon('plus'), onclick: () => { openTab('secrets'); Secrets.edit(null); } })), sec, tags.children.length ? tags : null),
      h('div', { class: 'side-foot' },
        h('button', { class: 'btn ghost small', html: `${icon('search')} Search <kbd>${MOD}K</kbd>`, onclick: () => Palette.show() }),
        h('button', { class: 'btn ghost small', html: `<kbd>?</kbd> Keys`, onclick: shortcuts })));
  }

  /* ── status bar ── */
  const SYNC = {
    saved: ['ok', 'Saved to disk'], saving: ['busy', 'Saving…'], unsaved: ['pending', 'Unsaved changes'],
    error: ['bad', 'Save failed'], conflict: ['bad', 'Changed on disk'], memory: ['mem', 'Not saved to disk'], idle: ['', ''],
  };
  function renderStatus() {
    if (!Store.S.vault || !Store.S.data) return;
    const v = Store.S.vault, st = Store.S.status;
    const [cls] = SYNC[st] || SYNC.idle;
    const text = Store.S.statusText || (SYNC[st] || SYNC.idle)[1];
    const where = v.kind === 'dir' ? `${v.name}/${v.file}` : v.kind === 'opfs' ? 'Browser storage' : v.name;
    const nNotes = Store.S.notes.size, nSec = Store.S.data.secrets.length;
    const act = Store.S.data.ui.active;
    statusEl.innerHTML =
      `<span class="st-item st-vault" title="${esc(v.kind === 'dir' ? 'Folder vault' : v.kind === 'opfs' ? 'Stored in this browser' : 'In this tab only')}">${icon(v.kind === 'memory' ? 'note' : 'folder')}${esc(where)}</span>` +
      `<button class="st-item st-sync st-${cls}" data-act="sync" title="${st === 'conflict' ? 'Resolve' : st === 'error' ? 'Retry' : st === 'memory' ? 'Download the vault' : 'Save now'}"><i class="dot"></i>${esc(text)}</button>` +
      `<span class="grow"></span>` +
      (act && act !== 'secrets' ? `<button class="st-item" data-act="zoom" title="Reset zoom (0)">${Math.round(Board.zoom() * 100)}%</button>` : '') +
      `<span class="st-item muted">${nNotes} ${nNotes === 1 ? 'note' : 'notes'}, ${nSec} ${nSec === 1 ? 'secret' : 'secrets'}</span>` +
      `<button class="st-item" data-act="lock" title="${Store.S.crypt ? 'Encrypted. Click to lock.' : 'Not encrypted. Click to set a passphrase.'}">${icon(Store.S.crypt ? 'lock' : 'unlock')}${Store.S.crypt ? 'Encrypted' : 'Plain'}</button>` +
      `<button class="st-item" data-act="theme" title="Light or dark">${icon('sun')}</button>`;
    document.title = (st === 'unsaved' || st === 'error' || st === 'conflict' ? '● ' : '') + (act ? tabLabel(act) + ' — ' : '') + 'frogmouth';
  }
  function onStatusClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'sync') {
      const st = Store.S.status;
      if (st === 'conflict') resolveConflict();
      else if (Store.S.vault.kind === 'memory') downloadVault();
      else Store.saveNow.flush();
    } else if (a === 'zoom') Board.zoomAt(1);
    else if (a === 'lock') { if (Store.S.crypt) lock(); else setPass(); }
    else if (a === 'theme') setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day');
  }

  async function resolveConflict() {
    const v = await Modal.open({
      title: 'The vault changed on disk',
      body: h('p', { class: 'muted', text: `${Store.S.vault.file} was edited outside this tab (another window, a sync tool, or git) while you had unsaved changes here.` }),
      actions: [{ label: 'Cancel', value: null }, { label: 'Load the disk version', value: 'disk' }, { label: 'Keep mine', primary: true, value: 'mine' }],
    });
    if (v === 'disk') {
      try { await Store.reloadFrom(); enter(); toast('Loaded the disk version'); }
      catch { toast('The disk version is encrypted with a different passphrase. Lock and reopen.', { kind: 'warn', timeout: 6000 }); }
    } else if (v === 'mine') { await Store.keepMine(); toast('Your version was written to disk'); }
  }

  /* ── boards ── */
  async function newBoard() {
    const name = await Modal.prompt('New board', '', { placeholder: 'e.g. Infra, Reading list, Sprint 42', label: 'Create board' });
    if (!name || !name.trim()) return;
    const b = { id: uid(), name: name.trim(), created: now(), notes: [] };
    Store.S.data.boards.push(b);
    Store.change('boards');
    openTab('b:' + b.id);
  }
  async function renameBoard(id) {
    const b = Store.board(id); if (!b) return;
    const name = await Modal.prompt('Rename board', b.name, { label: 'Rename' });
    if (!name || !name.trim() || name.trim() === b.name) return;
    b.name = name.trim();
    Store.change('boards');
    renderAll();
    for (const r of Store.S.notes.values()) if (r.board === b) { /* noop: hints read live */ }
  }
  async function deleteBoard(id) {
    const d = Store.S.data;
    const b = Store.board(id); if (!b) return;
    if (d.boards.length === 1) { toast('A vault keeps at least one board'); return; }
    if (b.notes.length && !(await Modal.confirm(`Delete “${b.name}”?`, `Its ${b.notes.length} ${b.notes.length === 1 ? 'note goes' : 'notes go'} with it. You can undo right after.`, 'Delete board'))) return;
    const i = d.boards.indexOf(b);
    d.boards.splice(i, 1);
    for (const n of b.notes) Store.S.notes.delete(n.id);
    const tabI = d.ui.tabs.indexOf('b:' + id);
    if (tabI >= 0) closeTab('b:' + id);
    Store.change('boards');
    renderAll();
    pushUndo(`Deleted board ${b.name}`, () => {
      d.boards.splice(Math.min(i, d.boards.length), 0, b);
      for (const n of b.notes) Store.S.notes.set(n.id, { note: n, board: b });
      Store.change('boards');
      openTab('b:' + b.id);
    });
  }

  function gotoNote(id) {
    const ref = Store.noteRef(id); if (!ref) return;
    openTab('b:' + ref.board.id);
    requestAnimationFrame(() => Board.center(id));
  }

  /* ── undo for deletions ── */
  function pushUndo(label, fn) {
    undoStack.push(fn);
    if (undoStack.length > 30) undoStack.shift();
    toast(label, { action: () => { const i = undoStack.lastIndexOf(fn); if (i >= 0) undoStack.splice(i, 1); fn(); }, label: `Undo` });
  }
  function undo() { const fn = undoStack.pop(); if (fn) { fn(); toast('Restored'); } }

  /* ── encryption ── */
  function setPass(change) {
    const a = h('input', { class: 'field', type: 'password', placeholder: 'Passphrase', 'data-shy': '', autocomplete: 'new-password' });
    const b = h('input', { class: 'field', type: 'password', placeholder: 'Repeat it', 'data-shy': '', autocomplete: 'new-password' });
    const err = h('p', { class: 'w-err' });
    Modal.open({
      title: change ? 'Change the passphrase' : 'Encrypt this vault',
      body: h('div', { class: 'stack' }, a, b, err, h('p', { class: 'muted small', text: 'The .frogmouth file is encrypted with AES-256-GCM. Images and tagged files in the folder are not. There is no recovery: a forgotten passphrase means a lost vault.' })),
      actions: [{ label: 'Cancel', value: null }, { label: change ? 'Change passphrase' : 'Encrypt', primary: true, run: async () => {
        if (a.value.length < 8) { err.textContent = 'Use at least 8 characters.'; return false; }
        if (a.value !== b.value) { err.textContent = 'The two entries differ.'; return false; }
        await Store.setPassphrase(a.value);
        if (Store.S.vault.kind === 'memory') Store.change('crypt');
        toast(change ? 'Passphrase changed' : 'Vault encrypted');
        renderStatus();
        return true;
      } }],
    });
  }
  async function removePass() {
    if (!(await Modal.confirm('Remove encryption?', 'The vault file will be saved as readable JSON.', 'Remove passphrase'))) return;
    await Store.setPassphrase(null);
    toast('Encryption removed'); renderStatus();
  }
  async function lock() {
    if (!Store.S.crypt) return;
    if (Store.S.vault.kind === 'memory') { toast('Download the vault before locking; it only lives in this tab', { kind: 'warn' }); return; }
    Store.saveNow.cancel();
    await Store.save();
    const { dir, kind } = Store.S.vault;
    Board.unmount();
    Store.close();
    await openVault(dir, kind);
  }
  setInterval(() => { if (Store.S.crypt && Store.S.vault && Store.S.vault.kind !== 'memory' && now() - lastActivity > 15 * 60000) lock(); }, 30000);
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => { lastActivity = now(); }, true));

  async function downloadVault() {
    const text = await Store.serialize();
    download(Store.S.vault.kind === 'memory' && /\.frogmouth$/.test(Store.S.vault.name) ? Store.S.vault.name : 'vault.frogmouth', text);
    if (Store.S.vault.kind === 'memory') { Store.S.dirty = false; Store.setStatus('memory', 'Downloaded'); }
  }

  async function closeVault() {
    if (Store.S.dirty && Store.S.vault.kind !== 'memory') await Store.save();
    if (Store.S.dirty && Store.S.vault.kind === 'memory' && !(await Modal.confirm('Close without downloading?', 'This vault only exists in this tab.', 'Close anyway'))) return;
    Board.unmount();
    Store.close();
    showWelcome();
  }

  function toggleSidebar() {
    const ui = Store.S.data.ui;
    ui.sidebar = !ui.sidebar;
    shell.classList.toggle('no-side', !ui.sidebar);
    Store.change('ui');
  }

  /* ── commands ── */
  const isBoard = () => Store.S.data && Store.S.data.ui.active && Store.S.data.ui.active !== 'secrets';
  function commands() {
    const c = !!Store.S.crypt;
    return [
      { title: 'New note', key: 'N', when: isBoard, run: () => Board.addNote(null, true) },
      { title: 'New board', run: newBoard },
      { title: 'Rename board', key: 'F2', when: isBoard, run: () => renameBoard(Store.S.data.ui.active.slice(2)) },
      { title: 'Delete board', when: isBoard, run: () => deleteBoard(Store.S.data.ui.active.slice(2)) },
      { title: 'Arrange notes', when: isBoard, run: () => Board.arrange() },
      { title: 'Fit all notes on screen', key: '⇧1', when: isBoard, run: () => Board.fit() },
      { title: 'Reset zoom to 100%', key: '0', when: isBoard, run: () => Board.zoomAt(1) },
      { title: 'Open secrets', key: ALT + 'S', run: () => openTab('secrets') },
      { title: 'New secret', run: () => { openTab('secrets'); Secrets.edit(null); } },
      { title: 'Import secrets from .env', run: () => { openTab('secrets'); Secrets.importEnv(); } },
      { title: 'Copy listed secrets as .env', run: () => { openTab('secrets'); Secrets.exportEnv(); } },
      { title: 'Close tab', key: ALT + 'W', when: () => !!Store.S.data.ui.active, run: () => closeTab(Store.S.data.ui.active) },
      { title: 'Toggle sidebar', key: MOD + '\\', run: toggleSidebar },
      { title: 'Switch light / dark', run: () => setTheme(document.documentElement.dataset.theme === 'day' ? 'night' : 'day') },
      { title: 'Save now', key: MOD + 'S', when: () => Store.S.vault.kind !== 'memory', run: () => Store.saveNow.flush() },
      { title: 'Reload from disk', when: () => Store.S.vault.kind === 'dir', run: async () => { try { await Store.reloadFrom(); enter(); toast('Reloaded'); } catch { toast('Could not reload', { kind: 'warn' }); } } },
      { title: 'Download a copy of the vault', run: downloadVault },
      { title: 'Encrypt vault with a passphrase', when: () => !c, run: () => setPass(false) },
      { title: 'Change passphrase', when: () => c, run: () => setPass(true) },
      { title: 'Remove passphrase', when: () => c, run: removePass },
      { title: 'Lock vault', key: MOD + '⇧L', when: () => c, run: lock },
      { title: 'Close vault', run: closeVault },
      { title: 'Keyboard shortcuts', key: '?', run: shortcuts },
    ];
  }

  function shortcuts() {
    const rows = [
      ['Everywhere', [[`${MOD}K`, 'Search notes, boards, secrets'], [`${MOD}⇧P`, 'Commands'], [`${MOD}S`, 'Save now'], [`${ALT}1–9`, 'Go to tab'], [`${ALT}[  ${ALT}]`, 'Previous / next tab'], [`${ALT}W`, 'Close tab'], [`${ALT}S`, 'Secrets'], [`${MOD}\\`, 'Toggle sidebar'], [`${MOD}Z`, 'Undo a delete'], ['?', 'This list']]],
      ['Board', [['N  or double-click', 'New note'], ['Tab', 'Next note'], ['↵', 'Edit selected note'], ['Esc', 'Stop editing / deselect'], ['Arrows', 'Nudge note (⇧ for more)'], ['1–6', 'Note colour'], [`${MOD}D`, 'Duplicate note'], ['Del', 'Delete note'], ['= − 0 ⇧1', 'Zoom in, out, 100%, fit'], ['Space-drag, wheel', 'Pan'], [`${MOD}+wheel, pinch`, 'Zoom'], [`${ALT}drag`, 'Move note from anywhere']]],
      ['Note editor', [['/', 'Block menu'], ['@', 'Link a note or file'], ['# ## ###', 'Headings'], ['- 1. [] >', 'Lists, todo, quote'], ['``` lang', 'Code block'], ['`code`', 'Inline code'], [`${MOD}B ${MOD}I ${MOD}U`, 'Bold, italic, underline'], [`${MOD}E`, 'Inline code'], [`${MOD}⇧X`, 'Strikethrough'], [`${MOD}${ALT}1–3`, 'Heading level'], [`${MOD}↵`, 'Leave code block'], ['Wheel on image', 'Zoom that image']]],
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
    const k = e.key, mod = modKey(e);
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (mod && !e.altKey && (lower === 'k' || (lower === 'p' && !e.shiftKey))) { e.preventDefault(); Popup.close(); Palette.isOpen() ? Palette.hide() : Palette.show(); return; }
    if (mod && e.shiftKey && lower === 'p') { e.preventDefault(); Palette.show('>'); return; }
    if (mod && lower === 's') { e.preventDefault(); if (Store.S.vault.kind === 'memory') downloadVault(); else { Store.saveNow.flush(); } return; }
    if (mod && e.shiftKey && lower === 'l') { e.preventDefault(); lock(); return; }
    if (Modal.isOpen() || Palette.isOpen()) return;
    if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); const t = Store.S.data.ui.tabs[+e.code.slice(5) - 1]; if (t) activate(t); return; }
    if (e.altKey && !mod && e.code === 'KeyW') { e.preventDefault(); if (Store.S.data.ui.active) closeTab(Store.S.data.ui.active); return; }
    if (e.altKey && !mod && e.code === 'BracketLeft') { e.preventDefault(); cycleTab(-1); return; }
    if (e.altKey && !mod && e.code === 'BracketRight') { e.preventDefault(); cycleTab(1); return; }
    if (e.altKey && !mod && e.code === 'KeyS') { e.preventDefault(); openTab('secrets'); return; }
    if (mod && k === '\\') { e.preventDefault(); toggleSidebar(); return; }
    if (isTypingTarget(e.target)) return;
    if (mod && lower === 'b') { e.preventDefault(); toggleSidebar(); return; }
    if (mod && lower === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (k === '?') { e.preventDefault(); shortcuts(); return; }
    if (k === 'F2' && isBoard()) { e.preventDefault(); renameBoard(Store.S.data.ui.active.slice(2)); return; }
    if (e.target.closest && e.target.closest('.side')) return;
    if (e.altKey && !e.shiftKey) return;
    const act = Store.S.data.ui.active;
    const handled = act === 'secrets' ? Secrets.key(e) : act ? Board.key(e) : false;
    if (handled) e.preventDefault();
  }

  /* ── boot ── */
  function boot() {
    const app = $('#app');
    welcome = h('div', { class: 'welcome' });
    tabsEl = h('div', { class: 'tabs', role: 'tablist' });
    side = h('aside', { class: 'side' });
    boardVp = h('div', { class: 'board-vp', hidden: true });
    secretsEl = h('div', { class: 'secrets', hidden: true });
    viewEmpty = h('div', { class: 'view-empty', hidden: true, html: `<p>No tab open.</p><p class="muted">Pick a board on the left or press <kbd>${MOD}K</kbd>.</p>` });
    statusEl = h('footer', { class: 'status' });
    const brand = h('div', { class: 'brand', title: 'frogmouth' }, Bird.make('mini'));
    shell = h('div', { class: 'shell', hidden: true },
      h('header', { class: 'top' }, brand, tabsEl,
        h('button', { class: 'top-btn', title: 'New board', html: icon('plus'), onclick: newBoard }),
        h('button', { class: 'top-search', html: `${icon('search')}<span>Search</span><kbd>${MOD}K</kbd>`, onclick: () => Palette.show() })),
      h('div', { class: 'main' }, side, h('section', { class: 'view' }, boardVp, secretsEl, viewEmpty)),
      statusEl);
    app.append(welcome, shell, h('div', { id: 'toasts', 'aria-live': 'polite' }));
    Board.init(boardVp);
    Secrets.init(secretsEl);
    statusEl.addEventListener('click', onStatusClick);
    addEventListener('keydown', onKey);
    bus.on('status', renderStatus);
    bus.on('zoom', () => { const z = statusEl.querySelector('[data-act="zoom"]'); if (z) z.textContent = Math.round(Board.zoom() * 100) + '%'; });
    bus.on('change', (what) => {
      if (what === 'secrets' || what === 'boards' || what === 'notes') renderSide();
      if (what === 'secrets') Board.refreshChips();
      renderStatus();
    });
    bus.on('goto-note', gotoNote);
    addEventListener('beforeunload', (e) => {
      if (!Store.S.data || !Store.S.dirty) return;
      if (Store.S.vault.kind !== 'memory') Store.saveNow.flush();
      e.preventDefault(); e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && Store.S.dirty && Store.S.vault && Store.S.vault.kind !== 'memory') Store.saveNow.flush(); });
    showWelcome();
  }

  return { boot, openTab, gotoNote, pushUndo, commands, enter, showWelcome, openVault };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.boot);
else App.boot();
