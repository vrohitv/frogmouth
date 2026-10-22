/* ── store: state, the .frogmouth file, sync, images ───────────────
   A vault is a folder. Inside it lives one `*.frogmouth` file (JSON,
   optionally encrypted) plus any images, which notes reference by path
   relative to the folder. Writes are debounced and atomic
   (createWritable swaps the file on close). */
const Store = (() => {
  const FILE = 'vault.frogmouth';
  const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
  const S = {
    data: null,
    vault: null, // {kind:'dir'|'opfs'|'memory', dir, fh, name, file}
    crypt: null,
    dirty: false, saving: false, again: false,
    lastMod: 0,
    status: 'idle', statusText: '',
    notes: new Map(), // id -> {note, board}
    rev: 0,
    imgCache: new Map(),
  };

  const canPickDir = () => typeof window.showDirectoryPicker === 'function';
  const canOPFS = () => !!(navigator.storage && navigator.storage.getDirectory);

  /* ── data shape ── */
  function blankData() {
    const b = { id: uid(), name: 'Inbox', created: now(), notes: [] };
    const n1 = uid(), n2 = uid(), n3 = uid();
    const t = now();
    b.notes.push(
      { id: n1, x: 80, y: 80, w: 300, h: null, color: 'straw', z: 3, created: t, updated: t,
        html: '<p>Welcome to frogmouth</p><p>Everything lives in one <code>.frogmouth</code> file in the folder you chose.</p>' +
          '<ul><li>Type <code>/</code> for blocks: headings, lists, todos, code, images</li><li>Type <code>@</code> to link another note</li>' +
          '<li>Type <code>```</code> then space for a code block</li><li>Drag the top edge of a note to move it</li></ul>' +
          `<p>Press <code>${MOD}K</code> to search everything.</p>` },
      { id: n2, x: 420, y: 80, w: 340, h: null, color: 'night', z: 2, created: t, updated: t,
        html: '<p>Retry with backoff</p><pre class="code" data-lang="js"><code>' + esc(
          'async function retry(fn, tries = 5) {\n  for (let i = 0; i < tries; i++) {\n    try { return await fn(); }\n    catch (err) {\n      // 100ms, 200ms, 400ms ...\n      await sleep(100 * 2 ** i);\n    }\n  }\n  throw new Error("gave up");\n}') +
          '</code></pre><p>Used by <a class="mention" data-note="' + n3 + '" contenteditable="false">@Today</a></p>' },
      { id: n3, x: 80, y: 360, w: 260, h: null, color: 'lichen', z: 1, created: t, updated: t,
        html: '<p>Today</p><ul data-type="todo"><li data-checked="true">Open a vault folder</li><li data-checked="false">Add a secret with tags like <code>env:prod</code></li><li data-checked="false">Read <a class="mention" data-note="' + n1 + '" contenteditable="false">@Welcome to frogmouth</a></li></ul>' },
    );
    return {
      boards: [b],
      secrets: [{ id: uid(), key: 'EXAMPLE_API_TOKEN', value: 'replace-me-' + uid(), tags: ['env:dev', 'example'], desc: 'Safe to delete', created: t, updated: t }],
      ui: { tabs: ['b:' + b.id, 'secrets'], active: 'b:' + b.id, sidebar: true },
    };
  }

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    d.boards = Array.isArray(d.boards) ? d.boards.filter((b) => b && typeof b === 'object') : [];
    for (const b of d.boards) {
      b.id = String(b.id || uid());
      b.name = String(b.name || 'Untitled');
      b.notes = Array.isArray(b.notes) ? b.notes.filter((n) => n && typeof n === 'object') : [];
      for (const n of b.notes) {
        n.id = String(n.id || uid());
        n.x = +n.x || 0; n.y = +n.y || 0;
        n.w = clamp(+n.w || 260, 140, 2000);
        n.h = n.h ? clamp(+n.h, 60, 3000) : null;
        n.color = n.color || 'straw';
        n.z = +n.z || 1;
        n.html = typeof n.html === 'string' ? n.html : '';
        if (typeof n.title !== 'string' || typeof n.text !== 'string') Object.assign(n, Editor.derive(n.html));
      }
    }
    if (!d.boards.length) d.boards.push({ id: uid(), name: 'Inbox', created: now(), notes: [] });
    d.secrets = Array.isArray(d.secrets) ? d.secrets.filter((x) => x && typeof x === 'object') : [];
    for (const x of d.secrets) {
      x.id = String(x.id || uid());
      x.key = String(x.key || '');
      x.value = String(x.value ?? '');
      x.tags = Array.isArray(x.tags) ? x.tags.map(String).filter(Boolean) : [];
      x.desc = String(x.desc || '');
    }
    d.ui = Object.assign({ tabs: [], active: null, sidebar: true }, d.ui || {});
    return d;
  }

  function index() {
    S.notes.clear();
    for (const b of S.data.boards) for (const n of b.notes) S.notes.set(n.id, { note: n, board: b });
  }

  /* ── status ── */
  function setStatus(status, text = '') {
    S.status = status; S.statusText = text;
    bus.emit('status', status, text);
  }

  /* ── open / load ── */
  async function findFile(dir) {
    let first = null;
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !name.endsWith('.frogmouth')) continue;
      if (name === FILE) return h;
      if (!first || name < first.name) first = h;
    }
    return first;
  }

  /* returns {ok:true} | {locked:true, env} */
  async function openDir(dir, kind = 'dir') {
    let fh = await findFile(dir);
    let created = false;
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
      S.crypt = null;
      setData(blankData());
      await save();
      return { ok: true, fresh: true };
    }
    const env = parse(text);
    if (env.encrypted) return { locked: true, env };
    S.crypt = null;
    setData(env.data);
    backup(text);
    return { ok: true };
  }

  function parse(text) {
    let j;
    try { j = JSON.parse(text); } catch { throw new Error(`${S.vault ? S.vault.file : 'This file'} is not valid JSON. Fix it in a text editor or restore a backup from .frogmouth-backups.`); }
    if (j && j.encrypted) return j;
    if (j && j.data) return { data: j.data };
    return { data: j }; // tolerate a bare data object
  }

  async function unlock(pass, env) {
    const { c, text } = await Vcrypt.open(pass, env);
    S.crypt = c;
    setData(JSON.parse(text));
    return true;
  }

  function openMemory(data, name = 'Scratch') {
    S.vault = { kind: 'memory', name, file: FILE };
    S.crypt = null;
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
    S.data = null; S.vault = null; S.crypt = null; S.dirty = false;
    setStatus('idle');
  }

  /* ── saving ── */
  async function serialize() {
    const body = JSON.stringify(S.data, null, 1);
    if (S.crypt) return JSON.stringify(await Vcrypt.seal(S.crypt, body));
    return '{"frogmouth":1,"encrypted":false,"saved":"' + new Date().toISOString() + '","data":' + body + '}\n';
  }

  async function save() {
    if (!S.vault || S.vault.kind === 'memory') return;
    if (S.saving) { S.again = true; return; }
    S.saving = true;
    setStatus('saving', 'Saving…');
    try {
      const text = await serialize();
      const w = await S.vault.fh.createWritable();
      await w.write(text);
      await w.close();
      const f = await S.vault.fh.getFile();
      S.lastMod = f.lastModified;
      S.dirty = false;
      setStatus('saved', 'Saved');
    } catch (err) {
      console.error(err);
      setStatus('error', err && err.name === 'NotAllowedError' ? 'No write permission' : 'Save failed');
    } finally {
      S.saving = false;
      if (S.again) { S.again = false; save(); }
    }
  }
  const saveNow = debounce(save, 350);

  function change(what) {
    if (!S.data) return;
    S.dirty = true;
    S.rev++;
    if (S.vault.kind === 'memory') setStatus('memory', 'Unsaved — download to keep');
    else { if (S.status !== 'conflict') setStatus('unsaved', 'Unsaved'); saveNow(); }
    bus.emit('change', what);
  }

  /* ── watching the file for edits made elsewhere ── */
  async function checkDisk() {
    if (!S.vault || S.vault.kind !== 'dir' || S.saving || document.hidden) return;
    try {
      const f = await S.vault.fh.getFile();
      if (f.lastModified <= S.lastMod) return;
      if (S.dirty) { setStatus('conflict', 'Changed on disk'); return; }
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
    const env = parse(text);
    S.lastMod = f.lastModified;
    if (env.encrypted) {
      if (!S.crypt) throw new Error('locked');
      const { text: plain } = await Vcrypt.openWithKey(S.crypt, env);
      setData(JSON.parse(plain));
    } else {
      S.crypt = null;
      setData(env.data);
    }
  }

  async function keepMine() {
    S.lastMod = Infinity; // ignore the disk version
    await save();
  }

  /* ── encryption toggles ── */
  async function setPassphrase(pass) {
    S.crypt = pass ? await Vcrypt.create(pass) : null;
    S.dirty = true;
    await save();
  }

  /* ── daily backup of the raw file, keeps the last 14 ── */
  async function backup(text) {
    if (!S.vault || S.vault.kind !== 'dir') return;
    try {
      const dir = await S.vault.dir.getDirectoryHandle('.frogmouth-backups', { create: true });
      const day = new Date().toISOString().slice(0, 10);
      const name = S.vault.file.replace(/\.frogmouth$/, '') + '-' + day + '.frogmouth';
      try { await dir.getFileHandle(name); return; } catch {}
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(text); await w.close();
      const names = [];
      for await (const [n, h] of dir.entries()) if (h.kind === 'file' && n.endsWith('.frogmouth')) names.push(n);
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
        else if (!name.endsWith('.frogmouth') && (!re || re.test(name))) out.push(prefix + name);
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

  return {
    S, FILE, canPickDir, canOPFS, blankData, normalize, index, openDir, unlock, openMemory, setData, close,
    serialize, save, saveNow, change, checkDisk, reloadFrom, keepMine, setPassphrase, recents, forgetRecent,
    saveImage, resolveImage, listImages, listFiles, fileAt, importFile, hasFolder, board, noteRef, secret, setStatus,
  };
})();
