/* ── board: an infinite canvas of draggable sticky notes ──────────── */
const Board = (() => {
  const COLORS = ['straw', 'lichen', 'dusk', 'moth', 'rose', 'night'];
  const GRID = 8;
  let vp, plane, empty, board = null, view = { x: 0, y: 0, z: 1 }, sel = null, maxZ = 1;
  const els = new Map();
  let spaceDown = false;

  const saveView = debounce(() => board && ls.set('view:' + board.id, view), 300);

  function init(viewport) {
    vp = viewport;
    plane = h('div', { class: 'plane' });
    empty = h('div', { class: 'board-empty', html: `<p>An empty board.</p><p class="muted">Double-click anywhere or press <kbd>N</kbd> to add a note. Drop images or files here too.</p>` });
    vp.append(plane, empty);
    vp.addEventListener('pointerdown', onVpDown);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('dblclick', (e) => {
      if (e.target !== vp && e.target !== plane && e.target !== empty && !empty.contains(e.target)) return;
      const p = toBoard(e.clientX, e.clientY);
      addNote({ x: p.x - 20, y: p.y - 14 }, true);
    });
    vp.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); vp.classList.add('drop'); } });
    vp.addEventListener('dragleave', (e) => { if (e.target === vp) vp.classList.remove('drop'); });
    vp.addEventListener('drop', onDrop);
    addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTypingTarget(e.target) && !Modal.isOpen()) { if (!spaceDown) { spaceDown = true; vp.classList.add('grab'); } e.preventDefault(); } });
    addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; vp.classList.remove('grab'); } });
    new ResizeObserver(() => board && applyView()).observe(vp);
    bus.on('change', (what) => { if (what === 'note' || what === 'notes') refreshFeet(); });
  }

  const toBoard = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };

  function applyView() {
    plane.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
    const g = 24 * view.z;
    vp.style.backgroundSize = `${g}px ${g}px`;
    vp.style.backgroundPosition = `${view.x}px ${view.y}px`;
    vp.classList.toggle('far', view.z < 0.5);
    bus.emit('zoom', view.z);
    saveView();
  }

  /* ── mount / unmount ── */
  function mount(b) {
    if (board === b && plane.isConnected) return;
    unmount();
    board = b;
    els.clear();
    plane.replaceChildren();
    view = ls.get('view:' + b.id, null) || { x: 40, y: 40, z: 1 };
    maxZ = b.notes.reduce((m, n) => Math.max(m, n.z || 1), 1);
    const frag = document.createDocumentFragment();
    for (const n of b.notes) frag.append(build(n));
    plane.append(frag);
    applyView();
    updateEmpty();
    refreshFeet();
  }
  function unmount() {
    const a = document.activeElement;
    if (a && a.closest && a.closest('.plane')) a.blur();
    sel = null; board = null;
  }
  function updateEmpty() { empty.hidden = !!(board && board.notes.length); }

  /* ── a note element ── */
  function build(n) {
    const body = Editor.mount(n, (out) => commit(n, out));
    const grip = h('div', { class: 'note-grip', title: 'Drag to move' },
      h('div', { class: 'note-swatches' }, COLORS.map((c, i) => h('button', { class: 'sw paper-' + c, title: `${c} (${i + 1})`, 'data-color': c, tabindex: '-1' }))),
      h('button', { class: 'note-x', title: 'Delete note (Del)', html: icon('x'), tabindex: '-1' }));
    const foot = h('div', { class: 'note-foot' });
    const edges = ['e', 's', 'se'].map((d) => h('div', { class: 'rz rz-' + d, 'data-rz': d, title: d === 's' ? 'Drag to resize. Double-click for auto height.' : 'Drag to resize' }));
    const el = h('div', { class: 'note paper-' + n.color, 'data-id': n.id }, grip, body, foot, ...edges);
    place(n, el);
    els.set(n.id, el);

    /* View mode: a click selects, a drag moves the note from anywhere on it.
       Edit mode (double-click, Enter): the body is editable and only the
       top edge or an Alt-drag moves it. */
    el.addEventListener('pointerdown', (e) => {
      select(n.id);
      bringFront(n);
      if (e.button !== 0) return;
      const t = e.target;
      const rz = t.closest('.rz');
      if (rz) { e.preventDefault(); e.stopPropagation(); resize(e, n, el, rz.dataset.rz); return; }
      if (t.closest('figure.pic, .note-grip button, .backlinks')) return;
      const editing = el.classList.contains('editing');
      if (t.closest('.note-grip') || e.altKey || !editing) {
        if (!editing) {
          e.preventDefault(); // no caret, no text selection while moving
          const a = document.activeElement;
          if (a && a !== document.body && a.closest && !el.contains(a) && a.closest('.plane')) a.blur();
        }
        drag(e, n, el);
      }
    });
    // a drag must not also count as a click on a link or checkbox
    el.addEventListener('click', (e) => { if (el._dragged) { el._dragged = false; e.preventDefault(); e.stopPropagation(); } }, true);
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.rz-s, .rz-se')) { n.h = null; place(n, el); Editor.refit(el); Store.change('notes'); return; }
      if (e.target.closest('figure.pic, .note-grip button, .rz') || el.classList.contains('editing')) return;
      e.preventDefault();
      editAt(n.id, e.clientX, e.clientY);
    });
    grip.addEventListener('pointerdown', (e) => {
      const sw = e.target.closest('.sw');
      if (sw) { e.preventDefault(); e.stopPropagation(); setColor(n, sw.dataset.color); return; }
      if (e.target.closest('.note-x')) { e.preventDefault(); e.stopPropagation(); remove(n.id); }
    });
    body.addEventListener('focus', () => { el.classList.add('editing'); select(n.id); });
    // leave edit mode once focus has really gone elsewhere (not to a / menu or picker)
    const settle = () => {
      if (!el.isConnected || el.contains(document.activeElement)) return;
      if (Popup.isOpen() || Modal.isOpen()) { setTimeout(settle, 250); return; }
      el.classList.remove('editing');
      body.contentEditable = 'false';
      // a note left completely empty disappears quietly
      if (!body.textContent.replace(/[\s\u200b]/g, '') && !body.querySelector('figure,a,span,hr,pre,li')) remove(n.id, true);
    };
    body.addEventListener('blur', () => setTimeout(settle, 120));
    body.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !Popup.isOpen()) setTimeout(settle, 0); });
    foot.addEventListener('click', (e) => { if (e.target.closest('.backlinks')) backlinksMenu(n, foot); });
    return el;
  }

  function place(n, el = els.get(n.id)) {
    if (!el) return;
    el.style.transform = `translate(${n.x}px,${n.y}px)`;
    el.style.width = n.w + 'px';
    el.style.height = n.h ? n.h + 'px' : '';
    el.style.zIndex = n.z || 1;
  }

  function commit(n, out) {
    const titleChanged = out.title !== n.title;
    if (out.html === n.html && !titleChanged) return;
    n.html = out.html; n.text = out.text; n.title = out.title; n.updated = now();
    Store.change('note');
    if (titleChanged) for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body'));
  }

  /* ── drag / resize ── */
  function drag(e, n, el) {
    const sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y;
    let moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; el.classList.add('dragging'); }
      n.x = ox + dx; n.y = oy + dy;
      if (!ev.altKey) { n.x = Math.round(n.x / GRID) * GRID; n.y = Math.round(n.y / GRID) * GRID; }
      place(n, el);
    };
    const up = () => {
      el.classList.remove('dragging');
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { el._dragged = true; setTimeout(() => { el._dragged = false; }, 0); Store.change('notes'); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  /* dir: 'e' width, 's' height, 'se' both */
  function resize(e, n, el, dir) {
    const sx = e.clientX, sy = e.clientY, ow = n.w, oh = el.offsetHeight;
    el.classList.add('resizing');
    const mv = (ev) => {
      if (dir !== 's') n.w = clamp(Math.round((ow + (ev.clientX - sx) / view.z) / GRID) * GRID, 160, 2000);
      if (dir !== 'e') n.h = clamp(Math.round((oh + (ev.clientY - sy) / view.z) / GRID) * GRID, 80, 3000);
      place(n, el);
    };
    const up = () => {
      el.classList.remove('resizing');
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      Editor.refit(el);
      Store.change('notes');
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  /* ── panning & zoom ── */
  function onVpDown(e) {
    const onBg = e.target === vp || e.target === plane || e.target === empty || empty.contains(e.target);
    if (!(onBg || e.button === 1 || spaceDown)) return;
    if (onBg && e.button === 0 && !spaceDown) {
      select(null);
      const a = document.activeElement; if (a && a.closest && a.closest('.plane')) a.blur();
    }
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
    vp.classList.add('panning');
    const mv = (ev) => { view.x = ox + ev.clientX - sx; view.y = oy + ev.clientY - sy; applyView(); };
    const up = () => { vp.classList.remove('panning'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  function onWheel(e) {
    const body = e.target.closest && e.target.closest('.note-body');
    if (body && !e.ctrlKey && !e.metaKey) {
      const canY = body.scrollHeight > body.clientHeight + 1;
      if (canY && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const atTop = body.scrollTop <= 0, atBot = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBot)) return;
      }
    }
    const pre = e.target.closest && e.target.closest('pre.code');
    if (pre && !e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && pre.scrollWidth > pre.clientWidth) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const r = vp.getBoundingClientRect();
      zoomAt(view.z * Math.exp(-e.deltaY * k * 0.01), e.clientX - r.left, e.clientY - r.top);
    } else {
      view.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
      view.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
      applyView();
    }
  }

  function zoomAt(z, cx, cy) {
    z = clamp(z, 0.2, 2.5);
    if (cx == null) { cx = vp.clientWidth / 2; cy = vp.clientHeight / 2; }
    view.x = cx - (cx - view.x) * (z / view.z);
    view.y = cy - (cy - view.y) * (z / view.z);
    view.z = z;
    applyView();
  }

  function animateView() {
    plane.classList.add('glide');
    clearTimeout(animateView.t);
    animateView.t = setTimeout(() => plane.classList.remove('glide'), 380);
  }

  function fit() {
    if (!board || !board.notes.length) { view = { x: 40, y: 40, z: 1 }; animateView(); applyView(); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of board.notes) {
      const el = els.get(n.id); const hh = el ? el.offsetHeight : 200;
      x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + hh);
    }
    const pad = 60, W = vp.clientWidth, H = vp.clientHeight;
    const z = clamp(Math.min((W - pad * 2) / (x2 - x1), (H - pad * 2) / (y2 - y1)), 0.2, 1);
    view = { z, x: (W - (x2 - x1) * z) / 2 - x1 * z, y: (H - (y2 - y1) * z) / 2 - y1 * z };
    animateView(); applyView();
  }

  /* ── selection & keyboard ── */
  function select(id) {
    if (sel === id) return;
    if (sel && els.get(sel)) els.get(sel).classList.remove('sel');
    sel = id;
    if (id && els.get(id)) els.get(id).classList.add('sel');
  }
  function bringFront(n) {
    if ((n.z || 1) >= maxZ && board.notes.filter((m) => m.z === n.z).length === 1) return;
    n.z = ++maxZ;
    place(n);
    Store.change('z');
  }

  function focusBody(id, end = true) {
    const el = els.get(id); if (!el) return;
    const body = el.querySelector('.note-body');
    body.contentEditable = 'true';
    el.classList.add('editing');
    select(id);
    body.focus({ preventScroll: true });
    const r = document.createRange();
    const last = body.lastElementChild && body.lastElementChild.tagName === 'FIGURE' ? body : (body.lastElementChild || body);
    r.selectNodeContents(last); r.collapse(!end);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  /* enter edit mode with the caret where the user double-clicked */
  function editAt(id, x, y) {
    const el = els.get(id); if (!el) return;
    const body = el.querySelector('.note-body');
    body.contentEditable = 'true';
    el.classList.add('editing');
    select(id);
    body.focus({ preventScroll: true });
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (r && body.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    else focusBody(id);
  }

  function center(id, flash = true) {
    const ref = Store.noteRef(id); const el = els.get(id);
    if (!ref || !el) return;
    const n = ref.note;
    const z = Math.max(view.z, 0.8);
    view = { z, x: vp.clientWidth / 2 - (n.x + n.w / 2) * z, y: Math.min(vp.clientHeight / 3, vp.clientHeight / 2 - (el.offsetHeight / 2) * z) - n.y * z };
    animateView(); applyView();
    select(id); bringFront(n);
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  function key(e) {
    if (!board) return false;
    const k = e.key;
    const n = sel && Store.noteRef(sel) && Store.noteRef(sel).note;
    if ((k === 'n' || k === 'N') && !modKey(e) && !e.altKey) { addNote(null, true); return true; }
    if (k === '=' || k === '+') { zoomAt(view.z * 1.2); return true; }
    if (k === '-' || k === '_') { zoomAt(view.z / 1.2); return true; }
    if (k === '0' && !modKey(e)) { zoomAt(1); return true; }
    if (k === '!' || (k === '1' && e.shiftKey)) { fit(); return true; }
    if (k === 'Tab') { cycle(e.shiftKey ? -1 : 1); return true; }
    if (!n) {
      const pan = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[k];
      if (pan) { view.x += pan[0]; view.y += pan[1]; applyView(); return true; }
      return false;
    }
    if (k === 'Enter') { focusBody(n.id); return true; }
    if (k === 'Escape') { select(null); return true; }
    if (k === 'Delete' || k === 'Backspace') { remove(n.id); return true; }
    if (/^[1-6]$/.test(k) && !modKey(e)) { setColor(n, COLORS[+k - 1]); return true; }
    if (modKey(e) && k.toLowerCase() === 'd') { duplicate(n); return true; }
    const d = e.shiftKey ? GRID * 5 : GRID;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[k];
    if (mv) { n.x += mv[0]; n.y += mv[1]; place(n); Store.change('notes'); return true; }
    return false;
  }

  function cycle(dir) {
    if (!board.notes.length) return;
    const order = board.notes.slice().sort((a, b) => (Math.round(a.y / 120) - Math.round(b.y / 120)) || a.x - b.x);
    const i = order.findIndex((m) => m.id === sel);
    const next = order[(i + dir + order.length) % order.length];
    center(next.id, false);
  }

  /* ── note operations ── */
  function freeSpot() {
    const W = vp.clientWidth, H = vp.clientHeight;
    let x = Math.round(((W / 2 - view.x) / view.z - 130) / GRID) * GRID;
    let y = Math.round(((H / 3 - view.y) / view.z - 40) / GRID) * GRID;
    while (board.notes.some((m) => Math.abs(m.x - x) < 16 && Math.abs(m.y - y) < 16)) { x += 24; y += 24; }
    return { x, y };
  }

  function addNote(at, focus, html = '<p><br></p>', extra = {}) {
    if (!board) return null;
    const p = at || freeSpot();
    const n = { id: uid(), x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID, w: 260, h: null, color: extra.color || (sel && Store.noteRef(sel) ? Store.noteRef(sel).note.color : 'straw'), z: ++maxZ, html, title: '', text: '', created: now(), updated: now() };
    Object.assign(n, Editor.derive(html));
    board.notes.push(n);
    Store.S.notes.set(n.id, { note: n, board });
    plane.append(build(n));
    updateEmpty();
    select(n.id);
    Store.change('notes');
    if (focus) {
      focusBody(n.id);
      requestAnimationFrame(() => { const el = els.get(n.id); if (el && !el.contains(document.activeElement)) focusBody(n.id); });
    }
    return n;
  }

  function remove(id, quiet) {
    const ref = Store.noteRef(id); if (!ref) return;
    const { note, board: b } = ref;
    const i = b.notes.indexOf(note);
    b.notes.splice(i, 1);
    Store.S.notes.delete(id);
    if (els.get(id)) { els.get(id).remove(); els.delete(id); }
    if (sel === id) sel = null;
    updateEmpty();
    Store.change('notes');
    if (quiet) return;
    const label = note.title ? `Deleted “${note.title.slice(0, 32)}”` : 'Deleted note';
    App.pushUndo(label, () => {
      b.notes.splice(Math.min(i, b.notes.length), 0, note);
      Store.S.notes.set(note.id, { note, board: b });
      if (board === b) { plane.append(build(note)); updateEmpty(); select(note.id); }
      Store.change('notes');
    });
  }

  function duplicate(n) {
    const c = addNote({ x: n.x + 24, y: n.y + 24 }, false, n.html, { color: n.color });
    if (c) { c.w = n.w; c.h = n.h; place(c); }
  }

  function setColor(n, c) {
    const el = els.get(n.id);
    if (el) { el.classList.remove('paper-' + n.color); el.classList.add('paper-' + c); }
    n.color = c;
    Store.change('notes');
  }

  /* tidy into rows, keeping reading order */
  function arrange() {
    if (!board || !board.notes.length) return;
    const gap = 24;
    const order = board.notes.slice().sort((a, b) => (Math.round(a.y / 160) - Math.round(b.y / 160)) || a.x - b.x);
    const x0 = Math.round(Math.min(...order.map((n) => n.x)) / GRID) * GRID;
    const y0 = Math.round(Math.min(...order.map((n) => n.y)) / GRID) * GRID;
    const width = Math.max(560, vp.clientWidth / view.z - 80);
    // masonry: columns of the widest note, each note goes to the shortest column
    const colW = Math.max(...order.map((n) => n.w));
    const cols = Math.max(1, Math.floor((width + gap) / (colW + gap)));
    const heights = new Array(cols).fill(y0);
    for (const n of order) {
      const el = els.get(n.id);
      let c = 0;
      for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 1) c = i;
      n.x = x0 + c * (colW + gap);
      n.y = heights[c];
      heights[c] += (el ? el.offsetHeight : 160) + gap;
    }
    plane.classList.add('arranging');
    for (const n of order) place(n);
    setTimeout(() => plane.classList.remove('arranging'), 420);
    Store.change('notes');
  }

  /* ── backlinks ── */
  const refreshFeet = debounce(() => {
    if (!board) return;
    const back = new Map();
    for (const [id, { note }] of Store.S.notes) {
      const re = /data-note="([^"]+)"/g; let m;
      const seen = new Set();
      while ((m = re.exec(note.html))) if (!seen.has(m[1])) { seen.add(m[1]); (back.get(m[1]) || back.set(m[1], []).get(m[1])).push(id); }
    }
    for (const [id, el] of els) {
      const list = back.get(id) || [];
      const foot = el.querySelector('.note-foot');
      const txt = list.length ? `${list.length} ${list.length === 1 ? 'note links' : 'notes link'} here` : '';
      if (foot.dataset.txt !== txt) { foot.dataset.txt = txt; foot.innerHTML = txt ? `<button class="backlinks" tabindex="-1">${esc(txt)}</button>` : ''; }
      foot._back = list;
    }
  }, 200);

  function backlinksMenu(n, foot) {
    const r = foot.getBoundingClientRect();
    Popup.open({
      x: r.left, y: r.bottom, title: 'Linked from',
      items: (foot._back || []).map((id) => { const ref = Store.noteRef(id); return ref && { id, label: ref.note.title || 'Untitled', hint: ref.board.name, icon: 'note' }; }).filter(Boolean),
      onPick: (it) => bus.emit('goto-note', it.id),
    });
  }

  /* ── drop files onto the board: one note per drop ── */
  async function onDrop(e) {
    vp.classList.remove('drop');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length || e.target.closest('.note')) return;
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    let html = '';
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        const res = await Store.saveImage(f, f.name);
        html += `<p>${esc(f.name)}</p><figure class="pic" contenteditable="false" data-src="${esc(res.path || res.dataUrl)}"></figure>`;
      } else {
        const path = await Store.importFile(f);
        if (path) html += `<p><span class="fref" contenteditable="false" data-path="${esc(path)}">${esc(f.name)}</span>&nbsp;</p>`;
        else toast('Open a vault folder to attach files', { kind: 'warn' });
      }
    }
    if (html) {
      const n = addNote({ x: p.x - 40, y: p.y - 20 }, false, html + '<p><br></p>');
      if (n && /figure/.test(html)) { n.w = 360; place(n); }
    }
  }

  return {
    init, mount, unmount, addNote, remove, arrange, fit, center, key, select, focusBody,
    zoom: () => view.z, zoomAt, current: () => board, selected: () => sel, COLORS,
    refreshChips: () => { for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body')); },
  };
})();
