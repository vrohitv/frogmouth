import { MOD, clamp, now, h, uid, debounce, esc, bus, toast, download, idb } from './00-util.js';
import { Editor } from './06-editor.js';

/* ── store: state, the .fm file, sync, images ───────────────────────
   A vault is a folder. Inside it lives one `*.fm` file (plain,
   readable JSON) plus any images, which notes reference by path
   relative to the folder. Writes are debounced and atomic
   (createWritable swaps the file on close). */
export const Store = (() => {
  const FILE = 'vault.fm';
  const EXT = '.fm';
  const BACKUPS = '.fm-backups';
  const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
  const S = {
    data: null,
    vault: null, // {kind:'dir'|'opfs'|'memory', dir, fh, name, file}
    force: false,
    dirty: false, saving: false, again: false,
    lastMod: 0,
    status: 'idle', statusText: '',
    notes: new Map(), // id -> {note, boards, board}
    rev: 0,
    imgCache: new Map(),
  };

  const canPickDir = () => typeof window.showDirectoryPicker === 'function';
  const canOPFS = () => !!(navigator.storage && navigator.storage.getDirectory);

  /* ── data shape ──────────────────────────────────────────────────
     Notes live in one library (data.notes). A board holds placements
     ({note, x, y, w, h, z}) that point at notes, so one note can sit on
     several boards, and deleting a board never deletes a note.
     Text, tags and colour belong to the note; position and size to the
     placement. */
  function blankData() {
    const b = { id: uid(), name: 'Inbox', created: now(), items: [] };
    const n1 = uid(), n2 = uid(), n3 = uid();
    const t = now();
    const notes = [
      { id: n1, color: 'moth', created: t, updated: t,
        html: '<p>Welcome to frogmouth</p><p>Everything lives in one <code>.fm</code> file in the folder you chose.</p>' +
          '<ul><li>Type <code>/</code> for blocks: headings, lists, todos, code, images</li><li>Type <code>@</code> to link another note</li>' +
          '<li>Type <code>```</code> then space for a code block</li><li>Click a note to select it, drag to move it, double-click to edit</li></ul>' +
          `<p>Press <code>${MOD}K</code> to search everything.</p>` },
      { id: n2, color: 'night', created: t, updated: t, tags: ['snippet', 'lang:js'],
        html: '<p>Retry with backoff</p><pre class="code" data-lang="js"><code>' + esc(
          'async function retry(fn, tries = 5) {\n  for (let i = 0; i < tries; i++) {\n    try { return await fn(); }\n    catch (err) {\n      // 100ms, 200ms, 400ms ...\n      await sleep(100 * 2 ** i);\n    }\n  }\n  throw new Error("gave up");\n}') +
          '</code></pre><p>Used by <a class="mention" data-note="' + n3 + '" contenteditable="false">@Today</a></p>' },
      { id: n3, color: 'lichen', created: t, updated: t,
        html: '<p>Today</p><ul data-type="todo"><li data-checked="true">Open a vault folder</li><li data-checked="false">Add a secret with tags like <code>env:prod</code></li><li data-checked="false">Read <a class="mention" data-note="' + n1 + '" contenteditable="false">@Welcome to frogmouth</a></li></ul>' },
    ];
    b.items.push(
      { note: n1, x: 80, y: 80, w: 320, h: null, z: 3 },
      { note: n2, x: 440, y: 80, w: 380, h: null, z: 2 },
      { note: n3, x: 80, y: 440, w: 280, h: null, z: 1 });
    return {
      version: 2,
      notes,
      boards: [b],
      secrets: [{ id: uid(), key: 'EXAMPLE_API_TOKEN', value: 'replace-me-' + uid(), tags: ['env:dev', 'example'], desc: 'Safe to delete', created: t, updated: t }],
      ui: { board: b.id, active: 'b:' + b.id },
    };
  }

  function normNote(n) {
    n.id = String(n.id || uid());
    n.color = n.color || 'moth';
    n.html = typeof n.html === 'string' ? n.html : '';
    n.tags = Array.isArray(n.tags) ? [...new Set(n.tags.map(String).filter(Boolean))] : [];
    if (typeof n.title !== 'string' || typeof n.text !== 'string') Object.assign(n, Editor.derive(n.html));
    return n;
  }
  function normItem(it) {
    it.x = +it.x || 0; it.y = +it.y || 0;
    it.w = clamp(+it.w || 260, 140, 2000);
    it.h = it.h ? clamp(+it.h, 60, 3000) : null;
    it.z = +it.z || 1;
    return it;
  }

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    d.notes = Array.isArray(d.notes) ? d.notes.filter((n) => n && typeof n === 'object') : [];
    const byId = new Map();
    for (const n of d.notes) { normNote(n); if (!byId.has(n.id)) byId.set(n.id, n); }
    d.boards = Array.isArray(d.boards) ? d.boards.filter((b) => b && typeof b === 'object') : [];
    for (const b of d.boards) {
      b.id = String(b.id || uid());
      b.name = String(b.name || 'Untitled');
      if (b.pinned !== true) delete b.pinned;
      b.opened = +b.opened || 0;
      b.items = Array.isArray(b.items) ? b.items.filter((it) => it && typeof it === 'object') : [];
      const seen = new Set();
      b.items = b.items.filter((it) => { it.note = String(it.note || ''); if (!byId.has(it.note) || seen.has(it.note)) return false; seen.add(it.note); return true; }).map(normItem);
    }
    d.notes = [...byId.values()];
    if (!d.boards.length) d.boards.push({ id: uid(), name: 'Inbox', created: now(), items: [] });
    d.secrets = Array.isArray(d.secrets) ? d.secrets.filter((x) => x && typeof x === 'object') : [];
    for (const x of d.secrets) {
      x.id = String(x.id || uid());
      x.key = String(x.key || '');
      x.value = String(x.value ?? '');
      x.tags = Array.isArray(x.tags) ? x.tags.map(String).filter(Boolean) : [];
      x.desc = String(x.desc || '');
    }
    d.ui = Object.assign({ board: null, active: null }, d.ui || {});
    d.ui.recent = Array.isArray(d.ui.recent) ? d.ui.recent.filter((id) => typeof id === 'string') : [];
    d.version = 2;
    return d;
  }

  /* S.notes: note id -> { note, boards: [boards it is placed on], board: first of them or null } */
  function index() {
    S.notes.clear();
    for (const n of S.data.notes) S.notes.set(n.id, { note: n, boards: [], board: null });
    for (const b of S.data.boards) for (const it of b.items) {
      const ref = S.notes.get(it.note);
      if (ref) { ref.boards.push(b); if (!ref.board) ref.board = b; }
    }
  }

  /* ── note operations ── */
  function createNote(fields = {}) {
    const t = now();
    const n = normNote({ id: uid(), html: '<p><br></p>', color: 'moth', created: t, updated: t, ...fields });
    S.data.notes.push(n);
    S.notes.set(n.id, { note: n, boards: [], board: null });
    return n;
  }
  /* put a note on a board (no-op if it is already there); returns the placement */
  function place(boardId, noteId, pos = {}) {
    const b = board(boardId); const ref = S.notes.get(noteId);
    if (!b || !ref) return null;
    const have = b.items.find((it) => it.note === noteId);
    if (have) return have;
    const it = normItem({ note: noteId, x: pos.x, y: pos.y, w: pos.w || 260, h: pos.h || null, z: pos.z || 1 });
    b.items.push(it);
    ref.boards.push(b); if (!ref.board) ref.board = b;
    return it;
  }
  /* take a note off one board; the note stays in the library */
  function unplace(boardId, noteId) {
    const b = board(boardId); if (!b) return null;
    const i = b.items.findIndex((it) => it.note === noteId);
    if (i < 0) return null;
    const [it] = b.items.splice(i, 1);
    const ref = S.notes.get(noteId);
    if (ref) { ref.boards = ref.boards.filter((x) => x !== b); ref.board = ref.boards[0] || null; }
    return { it, index: i };
  }
  /* delete a note from the library and every board; returns what undo needs */
  function deleteNote(id) {
    const ref = S.notes.get(id); if (!ref) return null;
    const placed = [];
    for (const b of S.data.boards) {
      const i = b.items.findIndex((it) => it.note === id);
      if (i >= 0) placed.push({ board: b, index: i, it: b.items.splice(i, 1)[0] });
    }
    const ni = S.data.notes.indexOf(ref.note);
    S.data.notes.splice(ni, 1);
    S.notes.delete(id);
    return { note: ref.note, index: ni, placed };
  }
  function restoreNote(saved) {
    S.data.notes.splice(Math.min(saved.index, S.data.notes.length), 0, saved.note);
    for (const p of saved.placed) if (S.data.boards.includes(p.board)) p.board.items.splice(Math.min(p.index, p.board.items.length), 0, p.it);
    index();
  }

  /* ── status ── */
  function setStatus(status, text = '') {
    S.status = status; S.statusText = text;
    bus.emit('status', status, text);
  }

  /* ── open / load ── */
  /* vault.fm, else the first *.fm in the folder */
  async function findFile(dir) {
    let first = null;
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !name.endsWith(EXT)) continue;
      if (name === FILE) return h;
      if (!first || name < first.name) first = h;
    }
    return first;
  }

  /* returns {ok:true, fresh?} */
  async function openDir(dir, kind = 'dir') {
    let fh = await findFile(dir), created = false;
    if (!fh) {
      fh = await dir.getFileHandle(FILE, { create: true });
      created = true;
    }
    const vault = { kind, dir, fh, name: kind === 'opfs' ? 'Browser storage' : dir.name, file: fh.name };
    const file = await fh.getFile();
    const text = created ? '' : await file.text();
    S.vault = vault;
    S.lastMod = file.lastModified;
    if (kind === 'dir') rememberRecent(dir);
    if (!text.trim()) {
      setData(blankData());
      await save();
      return { ok: true, fresh: true };
    }
    setData(parse(text));
    backup(text);
    return { ok: true };
  }

  function parse(text) {
    let j;
    try { j = JSON.parse(text); } catch { throw new Error(`${S.vault ? S.vault.file : 'This file'} is not valid JSON. Fix it in a text editor or restore a backup from ${BACKUPS}.`); }
    return j && j.data ? j.data : j; // the envelope, or a bare data object
  }

  function openMemory(data, name = 'Scratch') {
    S.vault = { kind: 'memory', name, file: FILE };
    setData(data || blankData());
    setStatus('memory', 'Kept in memory');
  }

  function setData(d) {
    S.data = normalize(d);
    index();
    S.dirty = false;
    S.rev++;
    if (S.vault && S.vault.kind !== 'memory') setStatus('saved', 'Saved');
    bus.emit('loaded');
  }

  function close() {
    saveNow.cancel();
    for (const u of S.imgCache.values()) URL.revokeObjectURL(u);
    S.imgCache.clear();
    S.data = null; S.vault = null; S.dirty = false; S.force = false;
    S.notes.clear();
    setStatus('idle');
    bus.emit('closed'); // views drop their DOM and caches (note text, revealed secrets, search index)
  }

  /* ── saving ── */
  function serialize() {
    return '{"frogmouth":1,"saved":"' + new Date().toISOString() + '","data":' + JSON.stringify(S.data, null, 1) + '}\n';
  }

  /* Write the vault. Each save records which change (S.rev) it wrote, so edits made
     while a write is in flight stay "unsaved" and get their own save. Before writing,
     the file is checked: if something else changed it since we last read or wrote it,
     nothing is overwritten and the user chooses (see keepMine / reloadFrom). */
  async function save() {
    if (!S.vault || S.vault.kind === 'memory') return;
    if (S.saving) { S.again = true; return; }
    S.saving = true;
    setStatus('saving', 'Saving…');
    try {
      if (S.vault.kind === 'dir' && !S.force) {
        const onDisk = await S.vault.fh.getFile();
        if (onDisk.lastModified > S.lastMod) { setStatus('conflict', 'Changed on disk'); return; }
      }
      const rev = S.rev;
      const text = serialize();
      const w = await S.vault.fh.createWritable();
      await w.write(text);
      await w.close();
      const f = await S.vault.fh.getFile();
      S.lastMod = f.lastModified;
      if (S.rev === rev) { S.dirty = false; setStatus('saved', 'Saved'); }
      else { setStatus('unsaved', 'Unsaved'); S.again = true; }
    } catch (err) {
      console.error(err);
      setStatus('error', err && err.name === 'NotAllowedError' ? 'No write permission' : 'Save failed');
    } finally {
      S.saving = false;
      S.force = false; // a forced write is one-off, whatever happened
      if (S.again) { S.again = false; if (S.status !== 'conflict') save(); }
    }
  }
  const saveNow = debounce(save, 350);

  function change(what) {
    if (!S.data) return;
    S.dirty = true;
    S.rev++;
    if (S.vault.kind === 'memory') setStatus('memory', 'Unsaved — download to keep');
    else if (S.status !== 'conflict') { setStatus('unsaved', 'Unsaved'); saveNow(); } // in a conflict, wait for the user's choice
    bus.emit('change', what);
  }

  /* ── watching the file for edits made elsewhere ── */
  async function checkDisk() {
    if (!S.vault || S.vault.kind !== 'dir' || S.saving || document.hidden) return;
    try {
      const f = await S.vault.fh.getFile();
      if (f.lastModified <= S.lastMod) return;
      if (S.dirty) { setStatus('conflict', 'Changed on disk'); return; }
      // an edit may still be on its way from the editor (it commits ~0.3 s after typing): try again shortly
      const a = document.activeElement;
      if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
      await reloadFrom(f);
      toast('Reloaded — the vault changed on disk');
    } catch (err) {
      if (err && err.name === 'NotFoundError') setStatus('error', 'Vault file is missing');
    }
  }
  setInterval(checkDisk, 2000);
  addEventListener('focus', checkDisk);

  async function reloadFrom(f) {
    f = f || (await S.vault.fh.getFile());
    const text = await f.text();
    const data = parse(text);
    S.lastMod = f.lastModified;
    setData(data);
    bus.emit('reloaded'); // the app re-renders every view from the new data
  }

  /* after "No write permission": ask again (must run from a click) and retry the save */
  async function regainAccess() {
    const h = S.vault && S.vault.kind === 'dir' && S.vault.dir;
    if (h && h.requestPermission) {
      try { if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return false; } catch { return false; }
    }
    await save();
    return S.status === 'saved';
  }

  /* resolve a conflict in favour of this tab: overwrite the disk version once */
  async function keepMine() {
    S.force = true;
    setStatus('unsaved', 'Unsaved');
    await save();
  }

  /* ── daily backup of the raw file, keeps the last 14 ── */
  async function backup(text) {
    if (!S.vault || S.vault.kind !== 'dir') return;
    try {
      const dir = await S.vault.dir.getDirectoryHandle(BACKUPS, { create: true });
      const day = new Date().toISOString().slice(0, 10);
      const name = S.vault.file.replace(/\.fm$/, '') + '-' + day + EXT;
      try { await dir.getFileHandle(name); return; } catch {}
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(text); await w.close();
      const names = [];
      for await (const [n, h] of dir.entries()) if (h.kind === 'file' && n.endsWith(EXT)) names.push(n);
      names.sort();
      while (names.length > 14) await dir.removeEntry(names.shift());
    } catch (err) { console.warn('backup skipped', err); }
  }

  /* ── recent folders (handles persist in IndexedDB) ── */
  async function rememberRecent(dir) {
    const list = (await idb.get('recents')) || [];
    const out = [{ name: dir.name, handle: dir, at: now() }];
    for (const r of list) {
      try { if (!(await r.handle.isSameEntry(dir))) out.push(r); } catch {}
    }
    await idb.set('recents', out.slice(0, 6));
  }
  const recents = async () => (await idb.get('recents')) || [];
  async function forgetRecent(handle) {
    const list = (await idb.get('recents')) || [];
    const out = [];
    for (const r of list) { try { if (!(await r.handle.isSameEntry(handle))) out.push(r); } catch {} }
    await idb.set('recents', out);
  }

  /* ── images (paths are relative to the vault folder) ── */
  const hasFolder = () => S.vault && (S.vault.kind === 'dir' || S.vault.kind === 'opfs');

  async function saveImage(blob, nameHint) {
    if (!hasFolder()) {
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      return { dataUrl: url };
    }
    const ext = ((nameHint && nameHint.split('.').pop()) || (blob.type.split('/')[1] || 'png')).replace('jpeg', 'jpg').replace('svg+xml', 'svg').toLowerCase();
    const assets = await S.vault.dir.getDirectoryHandle('assets', { create: true });
    const name = `img-${new Date().toISOString().slice(0, 10)}-${uid().slice(-6)}.${ext}`;
    const fh = await assets.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
    const path = 'assets/' + name;
    S.imgCache.set(path, URL.createObjectURL(blob));
    return { path };
  }

  async function resolveImage(path) {
    if (S.imgCache.has(path)) return S.imgCache.get(path);
    const f = await fileAt(path);
    if (!f) return null;
    const url = URL.createObjectURL(f);
    S.imgCache.set(path, url);
    return url;
  }

  /* every file in the vault folder (skips dotfiles, node_modules, the vault itself) */
  async function listFiles(re) {
    if (!hasFolder()) return [];
    const out = [];
    async function walk(dir, prefix, depth) {
      for await (const [name, h] of dir.entries()) {
        if (out.length > 5000) return;
        if (name.startsWith('.') || name === 'node_modules') continue;
        if (h.kind === 'directory') { if (depth < 6) await walk(h, prefix + name + '/', depth + 1); }
        else if (!name.endsWith(EXT) && (!re || re.test(name))) out.push(prefix + name);
      }
    }
    await walk(S.vault.dir, '', 0);
    return out.sort();
  }
  const listImages = () => listFiles(IMG_RE);

  async function fileAt(path) {
    if (!hasFolder()) return null;
    const parts = path.split('/').filter((p) => p && p !== '.');
    if (!parts.length || parts.some((p) => p === '..')) return null;
    let d = S.vault.dir;
    try {
      for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
      return await (await d.getFileHandle(parts[parts.length - 1])).getFile();
    } catch { return null; }
  }

  /* copy a dropped/picked file into the vault so it can be tagged */
  async function importFile(file) {
    if (!hasFolder()) return null;
    const dir = await S.vault.dir.getDirectoryHandle('files', { create: true });
    let name = file.name.replace(/[\\/:*?"<>|]/g, '_') || 'file';
    try { await dir.getFileHandle(name); name = name.replace(/(\.[^.]*)?$/, '-' + uid().slice(-4) + '$1'); } catch {}
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(file); await w.close();
    return 'files/' + name;
  }

  /* ── lookups ── */
  const board = (id) => S.data && S.data.boards.find((b) => b.id === id);
  const noteRef = (id) => S.notes.get(id);
  const secret = (id) => S.data && S.data.secrets.find((x) => x.id === id);
  /* every tag in use, on notes and secrets, sorted */
  function allTags() {
    const set = new Set();
    if (S.data) {
      for (const { note } of S.notes.values()) for (const t of note.tags || []) set.add(t);
      for (const x of S.data.secrets) for (const t of x.tags) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  /* note id -> ids of notes whose text links to it */
  function backlinks() {
    const back = new Map();
    for (const [id, { note }] of S.notes) {
      const re = /data-note="([^"]+)"/g; let m; const seen = new Set();
      while ((m = re.exec(note.html))) if (!seen.has(m[1])) { seen.add(m[1]); (back.get(m[1]) || back.set(m[1], []).get(m[1])).push(id); }
    }
    return back;
  }
  const linksOut = (note) => { const out = new Set(); const re = /data-note="([^"]+)"/g; let m; while ((m = re.exec(note.html))) if (S.notes.has(m[1])) out.add(m[1]); return [...out]; };

  return {
    S, FILE, canPickDir, canOPFS, blankData, normalize, index, openDir, openMemory, close,
    serialize, save, saveNow, change, reloadFrom, regainAccess, keepMine, recents, forgetRecent,
    saveImage, resolveImage, listImages, listFiles, fileAt, importFile, hasFolder, board, noteRef, secret, setStatus, allTags, backlinks, linksOut, createNote, place, unplace, deleteNote, restoreNote,
  };
})();
