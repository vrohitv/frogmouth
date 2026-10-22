import { kb, modKey, clamp, now, h, debounce, esc, isTypingTarget, bus, toast, ls, icon, Tags, fuzzy, markPositions, wheelZoom } from './00-util.js';
import { Store } from './03-store.js';
import { Popup, Modal, editTags } from './05-ui.js';
import { Editor } from './06-editor.js';
import { App } from './10-app.js';

/* ── board: an infinite canvas of draggable sticky notes ────────────
   A board shows placements ({note, x, y, w, h, z}) of notes from the
   library. Geometry lives on the placement, content on the note, so the
   same note can sit on several boards. Elements are keyed by note id. */
export const Board = (() => {
  // keys 1–9, in hue order; the names are part of the file format (docs/format.md)
  const COLORS = ['moth', 'straw', 'apricot', 'rose', 'heather', 'dusk', 'sea', 'lichen', 'night'];
  const GRID = 8;
  let vp, plane, empty, board = null, view = { x: 0, y: 0, z: 1 }, sel = null, maxZ = 1;
  const els = new Map();
  const group = new Set(); // every selected note; sel is the one Enter, T and the editor act on
  let spaceDown = false;

  /* The camera is kept as the board point at the centre of the viewport plus the zoom
     (cam), and the screen transform (view) is derived from it and the viewport size.
     So a different window or display size (an external monitor plugged in or out, a
     resized window, browser zoom) keeps the same point centred, and returning to a size
     gives back exactly the view it had: same inputs, same arithmetic, no drift. Notes'
     own positions are board coordinates and never depend on the screen. */
  let vw = 0, vh = 0, cam = { cx: 0, cy: 0, z: 1 };
  const saveView = debounce(() => board && ls.set('cam:' + board.id, cam), 300);
  const itemOf = (id) => board && board.items.find((it) => it.note === id);
  const noteOf = (id) => { const r = Store.noteRef(id); return r && r.note; };
  const items = () => (board ? board.items : []);

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
    new ResizeObserver(() => {
      const w = vp.clientWidth, hh = vp.clientHeight;
      if (w === vw && hh === vh) return;
      vw = w; vh = hh;
      view = { x: vw / 2 - cam.cx * cam.z, y: vh / 2 - cam.cy * cam.z, z: cam.z };
      if (board) applyView(true);
    }).observe(vp);
    bus.on('change', (what) => { if (what === 'note' || what === 'notes') { refreshFeet(); if (finder) refind(); } navSoon(); });
    buildNav();
    bus.on('closed', () => { disarm(); closeFind(); unmount(); plane.replaceChildren(); els.clear(); backMap = new Map(); });
  }

  const toBoard = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };

  /* resized: the viewport changed size, not the camera */
  function applyView(resized) {
    // the camera is the truth; the screen transform is always derived from it, so the
    // same camera at the same viewport size gives bit-for-bit the same view
    if (!resized) cam = { cx: (vw / 2 - view.x) / view.z, cy: (vh / 2 - view.y) / view.z, z: view.z };
    view = { x: vw / 2 - cam.cx * cam.z, y: vh / 2 - cam.cy * cam.z, z: cam.z };
    plane.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
    const g = 24 * view.z;
    vp.style.backgroundSize = `${g}px ${g}px`;
    vp.style.backgroundPosition = `${view.x}px ${view.y}px`;
    vp.classList.toggle('far', view.z < 0.5);
    bus.emit('zoom', view.z);
    if (picker) closePicker(); // it would float away from its note
    if (pct) pct.textContent = Math.round(view.z * 100) + '%';
    navSoon();
    if (!resized) saveView();
  }

  /* ── mount / unmount ── */
  function mount(b) {
    if (board === b && plane.isConnected) return;
    unmount();
    board = b;
    els.clear();
    plane.replaceChildren();
    vw = vp.clientWidth; vh = vp.clientHeight;
    const c = ls.get('cam:' + b.id, null);
    const saved = c && Number.isFinite(c.cx) && Number.isFinite(c.cy) && c.z > 0;
    if (saved) cam = { cx: c.cx, cy: c.cy, z: clamp(c.z, 0.2, 2.5) };
    view = saved ? { x: vw / 2 - cam.cx * cam.z, y: vh / 2 - cam.cy * cam.z, z: cam.z } : { x: 40, y: 40, z: 1 };
    maxZ = b.items.reduce((m, it) => Math.max(m, it.z || 1), 1);
    const frag = document.createDocumentFragment();
    for (const it of b.items) { const el = build(it); if (el) frag.append(el); }
    plane.append(frag);
    applyView(saved);
    updateEmpty();
    refreshFeet();
  }
  function unmount() {
    closeFind(); closePicker();
    const a = document.activeElement;
    if (a && a.closest && a.closest('.plane')) a.blur();
    sel = null; group.clear(); board = null;
  }
  function updateEmpty() { empty.hidden = !!(board && board.items.length); }

  /* ── a note element ── */
  function build(it) {
    const n = noteOf(it.note);
    if (!n) return null;
    const body = Editor.mount(n, (out) => commit(n, out));
    const grip = h('div', { class: 'note-grip', title: 'Drag to move' },
      h('button', { class: 'note-color', title: 'Colour (1–9)', 'aria-label': 'Colour', tabindex: '-1' }),
      h('button', { class: 'note-x', title: xTitle(), html: icon('x'), tabindex: '-1' }));
    const foot = h('div', { class: 'note-foot' });
    // every edge and corner resizes; double-click a bottom one for automatic height
    const edges = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('div', { class: 'rz rz-' + d, 'data-rz': d, title: d[0] === 's' ? 'Drag to resize. Double-click for auto height.' : 'Drag to resize' }));
    const el = h('div', { class: 'note paper-' + n.color, 'data-id': n.id }, grip, body, foot, ...edges);
    place(it, el);
    els.set(n.id, el);

    /* View mode: a click selects, a drag moves the note from anywhere on it.
       Edit mode (double-click, Enter): the body is editable and only the
       top edge or an Alt-drag moves it. */
    el.addEventListener('pointerdown', (e) => {
      const t = e.target;
      const editing = el.classList.contains('editing');
      // Shift-click adds a note to the selection, or takes it out
      if (e.shiftKey && e.button === 0 && !editing && !t.closest('.rz, figure.pic, .note-grip button, .note-foot, a, .fref, .sref')) {
        e.preventDefault(); toggle(n.id); return;
      }
      // a click on a note of a multi-selection keeps the selection, so a drag moves them all
      if (group.has(n.id) && group.size > 1) sel = n.id; else select(n.id);
      bringFront(it);
      if (e.button !== 0) return;
      const rz = t.closest('.rz');
      if (rz) { e.preventDefault(); e.stopPropagation(); resize(e, it, el, rz.dataset.rz); return; }
      if (t.closest('figure.pic, .note-grip button, .note-foot button, .tag-input')) return;
      if (t.closest('.note-grip') || e.altKey || !editing) {
        if (!editing) {
          e.preventDefault(); // no caret, no text selection while moving
          const a = document.activeElement;
          if (a && a !== document.body && a.closest && !el.contains(a) && a.closest('.plane')) a.blur();
        }
        drag(e, it, el);
      }
    });
    // a drag must not also count as a click on a link or checkbox
    el.addEventListener('click', (e) => { if (el._dragged) { el._dragged = false; e.preventDefault(); e.stopPropagation(); } }, true);
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.rz-s, .rz-se, .rz-sw')) { it.h = null; place(it, el); Editor.refit(el); Store.change('notes'); return; }
      if (e.target.closest('figure.pic, .note-grip button, .rz') || el.classList.contains('editing')) return;
      e.preventDefault();
      editAt(n.id, e.clientX, e.clientY);
    });
    grip.addEventListener('pointerdown', (e) => {
      const cb = e.target.closest('.note-color');
      if (cb) { e.preventDefault(); e.stopPropagation(); if (!group.has(n.id)) select(n.id); pickColor(n, cb); return; }
      if (e.target.closest('.note-x')) {
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) confirmDeleteEverywhere(n.id);
        else if (armed && armed.includes(n.id)) { if (Date.now() - armedAt > 500) { const a = armed; disarm(); removeMany(a); } } // not the second half of a double-click
        else { askRemove(n.id); armedAt = Date.now(); }
      }
    });
    body.addEventListener('focus', () => { el.classList.add('editing'); select(n.id); });
    // leave edit mode once focus has really gone elsewhere (not to a / menu or picker)
    const settle = () => {
      if (!el.isConnected || el.contains(document.activeElement)) return;
      if (Popup.isOpen() || Modal.isOpen()) { setTimeout(settle, 250); return; }
      el.classList.remove('editing');
      body.contentEditable = 'false';
      // no caret left blinking in a note that is no longer editable
      const s = getSelection();
      if (s.rangeCount && el.contains(s.anchorNode)) s.removeAllRanges();
      // a brand-new note left completely empty disappears quietly (unless it is used on another board)
      const ref = Store.noteRef(n.id);
      if (ref && ref.boards.length <= 1 && !n.tags.length && !body.textContent.replace(/[\s\u200b]/g, '') && !body.querySelector('figure,a,span,hr,pre,li')) removeEverywhere(n.id, true);
    };
    body.addEventListener('blur', () => setTimeout(settle, 120));
    body.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !Popup.isOpen()) setTimeout(settle, 0); });
    foot.addEventListener('click', (e) => {
      if (e.target.closest('.backlinks')) backlinksMenu(n, foot);
      else if (e.target.closest('.nf-boards')) boardsMenu(n, foot);
      else if (e.target.closest('.nf-add')) tagNote(n);
      else if (e.target.closest('.chip')) bus.emit('filter-notes', e.target.closest('.chip').dataset.tag);
    });
    return el;
  }

  function place(it, el = els.get(it.note)) {
    if (!el) return;
    el.style.transform = `translate(${it.x}px,${it.y}px)`;
    el.style.width = it.w + 'px';
    el.style.height = it.h ? it.h + 'px' : '';
    el.style.zIndex = it.z || 1;
    navSoon();
  }

  function commit(n, out) {
    const titleChanged = out.title !== n.title;
    if (out.html === n.html && !titleChanged) return;
    n.html = out.html; n.text = out.text; n.title = out.title; n.updated = now();
    Store.change('note');
    if (titleChanged) for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body'));
  }

  /* ── drag / resize ── */
  /* moves the note, or every selected note when it is part of a multi-selection;
     the grabbed note snaps to the grid and the others keep their offsets */
  function drag(e, it, el) {
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
    const many = group.has(it.note) && group.size > 1;
    const moving = (many ? [...group] : [it.note]).map(itemOf).filter(Boolean).map((m) => ({ m, x: m.x, y: m.y }));
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; for (const { m } of moving) { const x = els.get(m.note); if (x) x.classList.add('dragging'); } }
      let nx = ox + (ev.clientX - sx) / view.z, ny = oy + (ev.clientY - sy) / view.z;
      if (!ev.altKey) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
      for (const o of moving) { o.m.x = Math.round(o.x + nx - ox); o.m.y = Math.round(o.y + ny - oy); place(o.m); }
    };
    const up = () => {
      for (const { m } of moving) { const x = els.get(m.note); if (x) x.classList.remove('dragging'); }
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { el._dragged = true; setTimeout(() => { el._dragged = false; }, 0); Store.change('notes'); }
      else if (many) select(it.note); // a plain click on one of several selected notes selects just that one
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  /* dir: the edges being dragged, any of n e s w (or a corner, like 'nw'). Dragging the
     left or top edge moves the note too, so the opposite edge stays exactly where it was;
     the dragged edge snaps to the grid. */
  function resize(e, it, el, dir) {
    // the exact height: a note sized to its content can be a fraction of a pixel tall,
    // and rounding it would shift the bottom edge when the top edge is dragged
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, ow = it.w, oh = it.h || el.getBoundingClientRect().height / view.z;
    const right = ox + ow, bottom = oy + oh, snap = (v) => Math.round(v / GRID) * GRID;
    el.classList.add('resizing');
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
      if (dir.includes('e')) it.w = clamp(snap(ow + dx), 160, 2000);
      if (dir.includes('w')) { it.w = clamp(right - snap(ox + dx), 160, 2000); it.x = right - it.w; }
      if (dir.includes('s')) it.h = clamp(snap(oh + dy), 80, 3000);
      if (dir.includes('n')) { it.h = clamp(bottom - snap(oy + dy), 80, 3000); it.y = bottom - it.h; }
      place(it, el);
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
    if (onBg && e.button === 0 && e.shiftKey && !spaceDown) { e.preventDefault(); marquee(e); return; }
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

  /* Shift-drag on empty board draws a box; every note it touches joins the selection */
  function marquee(e) {
    const r0 = vp.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const before = [...group];
    const box = h('div', { class: 'marquee' });
    vp.append(box);
    const mv = (ev) => {
      const x1 = Math.min(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), x2 = Math.max(sx, ev.clientX), y2 = Math.max(sy, ev.clientY);
      Object.assign(box.style, { left: x1 - r0.left + 'px', top: y1 - r0.top + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
      const a = toBoard(x1, y1), b = toBoard(x2, y2);
      const hit = board.items.filter((m) => {
        const el = els.get(m.note), hh = el ? el.offsetHeight : 120;
        return m.x < b.x && m.x + m.w > a.x && m.y < b.y && m.y + hh > a.y;
      }).map((m) => m.note);
      setGroup(before.concat(hit));
    };
    const up = () => { box.remove(); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
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
      zoomAt(view.z * wheelZoom(e), e.clientX - r.left, e.clientY - r.top);
    } else {
      view.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
      view.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
      applyView();
    }
  }

  function zoomAt(z, cx, cy) {
    z = clamp(z, 0.2, 2.5);
    if (cx == null) { cx = vw / 2; cy = vh / 2; }
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
    if (!board || !board.items.length) { view = { x: 40, y: 40, z: 1 }; animateView(); applyView(); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const it of board.items) {
      const el = els.get(it.note); const hh = el ? el.offsetHeight : 200;
      x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + hh);
    }
    const pad = 60, W = vp.clientWidth, H = vp.clientHeight;
    const z = clamp(Math.min((W - pad * 2) / (x2 - x1), (H - pad * 2) / (y2 - y1)), 0.2, 1);
    view = { z, x: (W - (x2 - x1) * z) / 2 - x1 * z, y: (H - (y2 - y1) * z) / 2 - y1 * z };
    animateView(); applyView();
  }

  /* ── selection & keyboard ── */
  function setGroup(ids) {
    const next = new Set(ids);
    for (const id of group) if (!next.has(id) && els.get(id)) els.get(id).classList.remove('sel');
    for (const id of next) if (els.get(id)) els.get(id).classList.add('sel');
    group.clear();
    for (const id of next) group.add(id);
    if (!group.has(sel)) sel = ids.length ? ids[ids.length - 1] : null;
    navSoon();
  }
  function select(id) {
    if (sel === id && group.size === (id ? 1 : 0)) return;
    setGroup(id ? [id] : []);
    sel = id;
  }
  function toggle(id) {
    if (group.has(id)) setGroup([...group].filter((x) => x !== id));
    else { setGroup([...group, id]); sel = id; }
  }
  const selectAll = () => { if (board) setGroup(board.items.map((m) => m.note)); };
  const unselect = (id) => { group.delete(id); if (sel === id) sel = group.size ? [...group].pop() : null; };
  /* the selected notes on this board, in board order */
  const picked = () => (board ? board.items.filter((m) => group.has(m.note)).map((m) => m.note) : []);
  function bringFront(it) {
    if ((it.z || 1) >= maxZ && board.items.filter((m) => m.z === it.z).length === 1) return;
    it.z = ++maxZ;
    place(it);
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
    const it = itemOf(id); const el = els.get(id);
    if (!it || !el) return;
    const z = Math.max(view.z, 0.8);
    view = { z, x: vp.clientWidth / 2 - (it.x + it.w / 2) * z, y: Math.min(vp.clientHeight / 3, vp.clientHeight / 2 - (el.offsetHeight / 2) * z) - it.y * z };
    animateView(); applyView();
    select(id); bringFront(it);
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  function key(e) {
    if (!board) return false;
    const k = e.key;
    const it = sel && itemOf(sel), n = it && noteOf(sel);
    const ids = picked(), many = ids.length > 1;
    if (finder && k === 'Escape') { closeFind(); return true; }
    if (modKey(e) && k.toLowerCase() === 'a') { selectAll(); return true; }
    if ((k === 'n' || k === 'N') && !modKey(e) && !e.altKey) { addNote(null, true); return true; }
    if (k === '=' || k === '+') { zoomAt(view.z * 1.2); return true; }
    if (k === '-' || k === '_') { zoomAt(view.z / 1.2); return true; }
    if (k === '0' && !modKey(e)) { zoomAt(1); return true; }
    if (k === '!' || (k === '1' && e.shiftKey)) { fit(); return true; }
    if ((k === 'm' || k === 'M') && !modKey(e)) { toggleMap(); return true; }
    if (k === 'Tab') { cycle(e.shiftKey ? -1 : 1); return true; }
    if (k === 'a' || k === 'A') { addExisting(); return true; }
    if (!n) {
      const pan = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[k];
      if (pan) { view.x += pan[0]; view.y += pan[1]; applyView(); return true; }
      return false;
    }
    if (armed && armed.includes(n.id) && (k === 'Enter' || k === 'Delete' || k === 'Backspace')) { const a = armed; disarm(); removeMany(a); return true; }
    if (armed && k === 'Escape') { disarm(); return true; }
    if (k === 'Enter') { focusBody(n.id); return true; }
    if (k === 't' || k === 'T') { tagNote(n); return true; }
    if ((k === 'l' || k === 'L') && !modKey(e)) { const el = els.get(n.id); if ((backMap.get(n.id) || []).length && el) backlinksMenu(n, el.querySelector('.note-foot')); return true; }
    if (k === 'Escape') { select(null); return true; }
    // everything below acts on every selected note
    const all = many ? ids : [n.id];
    if ((k === 'Delete' || k === 'Backspace') && (e.shiftKey || modKey(e))) { confirmDeleteEverywhere(all); return true; }
    if (k === 'Delete' || k === 'Backspace') { askRemove(all); return true; }
    if (/^[1-9]$/.test(k) && !modKey(e)) { for (const id of all) setColor(noteOf(id), COLORS[+k - 1]); return true; }
    if (modKey(e) && k.toLowerCase() === 'd') { const out = all.map((id) => duplicate(itemOf(id))).filter(Boolean); setGroup(out.map((c) => c.id)); return true; }
    const d = e.shiftKey ? GRID * 5 : GRID;
    // Alt+Shift+arrows resize: right and down grow, left and up shrink
    if (e.altKey && e.shiftKey) {
      const rz = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] }[k];
      if (!rz) return false;
      for (const id of all) {
        const m = itemOf(id), el = els.get(id); if (!m || !el) continue;
        if (rz[0]) m.w = clamp(Math.round((m.w + rz[0]) / GRID) * GRID, 160, 2000);
        if (rz[1]) m.h = clamp(Math.round(((m.h || el.getBoundingClientRect().height / view.z) + rz[1]) / GRID) * GRID, 80, 3000);
        place(m, el); Editor.refit(el);
      }
      Store.change('notes');
      return true;
    }
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[k];
    if (mv) { for (const id of all) { const m = itemOf(id); m.x += mv[0]; m.y += mv[1]; place(m); } Store.change('notes'); return true; }
    return false;
  }

  const readingOrder = () => board.items.slice().sort((a, b) => (Math.round(a.y / 120) - Math.round(b.y / 120)) || a.x - b.x);
  function cycle(dir) {
    if (!board.items.length) return;
    const order = readingOrder();
    const i = order.findIndex((m) => m.note === sel);
    const next = order[(i + dir + order.length) % order.length];
    center(next.note, false);
  }

  /* ── zoom control and minimap (bottom right) ─────────────────────
     The minimap draws every note in its paper colour and the visible area as a
     frame; click or drag in it to move there. M shows or hides it. It is drawn on
     a canvas once per frame at most, so it stays cheap with thousands of notes. */
  let nav, pct, map, mapOn = ls.get('minimap', true), mapT = null, mapDrag = false, navRaf = 0, paperCache = null;
  function buildNav() {
    // the buttons never take focus, so Enter, Space and the board's keys keep working on the board
    const btn = (html, title, fn, cls = '') => {
      const b = h('button', { class: 'nav-btn ' + cls, title, 'aria-label': title, html, tabindex: '-1' });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', fn);
      return b;
    };
    pct = btn('100%', 'Zoom to 100% (0)', () => zoomAt(1), 'nav-pct');
    map = h('canvas', { class: 'minimap', role: 'img', 'aria-label': 'Minimap: click or drag to move around the board' });
    // + Note: a new note, or one that already exists (from the library or another board)
    const addBtn = btn(icon('plus'), 'Add a note: new (N) or existing (A)', () => {
      const r = addBtn.getBoundingClientRect();
      Popup.open({
        x: r.left, y: r.top - 92, above: r.top, items: [
          { id: 'new', label: 'New note', icon: 'note', hint: 'N' },
          { id: 'existing', label: 'Add an existing note…', icon: 'plus', hint: 'A' },
        ],
        onPick: (it) => (it.id === 'new' ? addNote(null, true) : addExisting()),
      });
    }, 'nav-add');
    nav = h('div', { class: 'board-nav' }, map, h('div', { class: 'nav-row' },
      h('div', { class: 'hud-pill nav-zoom' }, addBtn),
      h('div', { class: 'hud-pill nav-zoom' },
        btn('−', 'Zoom out (−)', () => zoomAt(view.z / 1.2)), pct, btn('+', 'Zoom in (=)', () => zoomAt(view.z * 1.2)),
        btn(icon('fit'), `Fit everything (${kb('shift+1')})`, fit), btn(icon('map'), 'Minimap (M)', toggleMap, 'nav-map'))));
    // the control is its own island: no panning, deselecting or new notes from clicks on it
    for (const t of ['pointerdown', 'dblclick', 'wheel']) nav.addEventListener(t, (e) => e.stopPropagation());
    map.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      mapDrag = true; // the map's scale stays fixed while dragging, so it does not slide under the pointer
      if (map.setPointerCapture) try { map.setPointerCapture(e.pointerId); } catch {}
      mapGo(e);
    });
    map.addEventListener('pointermove', (e) => { if (mapDrag) mapGo(e); });
    const end = () => { if (mapDrag) { mapDrag = false; navSoon(); } };
    map.addEventListener('pointerup', end); map.addEventListener('pointercancel', end);
    vp.append(nav);
    new MutationObserver(() => { paperCache = null; navSoon(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
  }
  function toggleMap() {
    mapOn = !mapOn; ls.set('minimap', mapOn);
    map.hidden = !(mapOn && board && board.items.length);
    navSoon();
  }
  const navSoon = () => { if (nav && !navRaf) navRaf = requestAnimationFrame(drawNav); };
  const heightOf = (m) => m.h || (els.get(m.note) && els.get(m.note).offsetHeight) || 160;
  function paperOf(c) {
    if (!paperCache) paperCache = new Map();
    let v = paperCache.get(c);
    if (!v) {
      const probe = h('div', { class: 'note paper-' + c, style: { display: 'none' } });
      vp.append(probe);
      v = getComputedStyle(probe).getPropertyValue('--paper').trim() || '#888';
      probe.remove();
      paperCache.set(c, v);
    }
    return v;
  }
  /* centre the view on the board point under the pointer in the minimap */
  function mapGo(e) {
    if (!mapT) return;
    const r = map.getBoundingClientRect();
    const bx = (e.clientX - r.left - mapT.ox) / mapT.s, by = (e.clientY - r.top - mapT.oy) / mapT.s;
    view.x = vw / 2 - bx * view.z; view.y = vh / 2 - by * view.z;
    applyView();
  }
  function drawNav() {
    navRaf = 0;
    if (!nav || !board) return;
    pct.textContent = Math.round(view.z * 100) + '%';
    nav.classList.toggle('map-off', !mapOn);
    const show = mapOn && board.items.length > 0;
    map.hidden = !show;
    if (!show) { mapT = null; return; }
    const W = map.clientWidth, H = map.clientHeight, dpr = devicePixelRatio || 1;
    if (!W || !H) return;
    if (map.width !== Math.round(W * dpr) || map.height !== Math.round(H * dpr)) { map.width = Math.round(W * dpr); map.height = Math.round(H * dpr); }
    const ctx = map.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // the visible area, in board units
    const v = { x: -view.x / view.z, y: -view.y / view.z, w: vw / view.z, h: vh / view.z };
    if (!mapDrag || !mapT) {
      let x1 = v.x, y1 = v.y, x2 = v.x + v.w, y2 = v.y + v.h;
      for (const m of board.items) { x1 = Math.min(x1, m.x); y1 = Math.min(y1, m.y); x2 = Math.max(x2, m.x + m.w); y2 = Math.max(y2, m.y + heightOf(m)); }
      const pad = Math.max(x2 - x1, y2 - y1) * 0.05, bw = x2 - x1 + pad * 2, bh = y2 - y1 + pad * 2;
      const s = Math.min(W / bw, H / bh);
      mapT = { s, ox: (W - bw * s) / 2 - (x1 - pad) * s, oy: (H - bh * s) / 2 - (y1 - pad) * s };
    }
    const { s, ox, oy } = mapT;
    const root = getComputedStyle(document.documentElement);
    const accent = root.getPropertyValue('--accent').trim(), line = root.getPropertyValue('--line').trim();
    ctx.lineWidth = 1;
    for (const m of board.items) {
      const n = noteOf(m.note);
      const x = ox + m.x * s, y = oy + m.y * s, w = Math.max(2, m.w * s), hh = Math.max(2, heightOf(m) * s);
      ctx.fillStyle = paperOf(n ? n.color : 'moth');
      ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = group.has(m.note) ? accent : line;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    }
    const fx = ox + v.x * s, fy = oy + v.y * s, fw = v.w * s, fh = v.h * s;
    ctx.globalAlpha = 0.12; ctx.fillStyle = accent; ctx.fillRect(fx, fy, fw, fh); ctx.globalAlpha = 1;
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
    ctx.strokeRect(fx + 0.75, fy + 0.75, fw - 1.5, fh - 1.5);
  }

  /* ── colour picker: the note's colour button opens a small grid of the nine papers ──
     Click a colour, press 1–9, or move with the arrows and press Enter; Esc or a
     click outside closes it. With several notes selected it colours all of them. */
  let picker = null;
  const cap = (c) => c[0].toUpperCase() + c.slice(1);
  function closePicker() { if (picker) { picker.remove(); picker = null; } }
  function pickColor(n, anchor) {
    const again = picker && picker.dataset.note === n.id;
    closePicker();
    if (again) return; // a second click on the same button closes it
    const ids = group.has(n.id) && group.size > 1 ? picked() : [n.id];
    const grid = h('div', { class: 'cp-grid', role: 'radiogroup', 'aria-label': 'Note colour' }, COLORS.map((c, i) => h('button', {
      class: 'cp-sw paper-' + c + (c === n.color ? ' on' : ''), role: 'radio', 'aria-checked': String(c === n.color),
      'aria-label': `${cap(c)}, key ${i + 1}`, title: `${cap(c)} (${i + 1})`, 'data-color': c, html: `<i>${i + 1}</i>`,
    })));
    picker = h('div', { class: 'cpick', role: 'dialog', 'aria-label': 'Note colour', 'data-note': n.id },
      h('div', { class: 'cp-title' }, h('span', { text: ids.length > 1 ? `Colour of ${ids.length} notes` : 'Colour' }), h('kbd', { text: '1–9' })), grid);
    document.body.append(picker);
    const r = anchor.getBoundingClientRect(), pr = picker.getBoundingClientRect();
    picker.style.left = clamp(r.left - 8, 8, innerWidth - pr.width - 8) + 'px';
    picker.style.top = (r.bottom + 6 + pr.height > innerHeight - 8 ? Math.max(8, r.top - pr.height - 6) : r.bottom + 6) + 'px';
    const apply = (c) => { for (const id of ids) { const x = noteOf(id); if (x) setColor(x, c); } closePicker(); };
    // a colour applies on the click, so pressing the wrong one and sliding off it changes nothing
    picker.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target.closest('.cp-sw')) e.preventDefault(); });
    picker.addEventListener('click', (e) => { const b = e.target.closest('.cp-sw'); if (b) apply(b.dataset.color); });
    picker.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the board does not see keys meant for the picker
      const btns = [...grid.children], i = btns.indexOf(document.activeElement);
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); apply(COLORS[+e.key - 1]); }
      else if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (i >= 0) { e.preventDefault(); apply(btns[i].dataset.color); } }
      else {
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
        if (d) { e.preventDefault(); btns[(Math.max(0, i) + d + btns.length) % btns.length].focus(); }
      }
    });
    (grid.querySelector('.on') || grid.firstChild).focus({ preventScroll: true });
  }
  addEventListener('pointerdown', (e) => { if (picker && !picker.contains(e.target) && !(e.target.closest && e.target.closest('.note-color'))) closePicker(); }, true);

  /* ── find on this board (mod+F) ──────────────────────────────────
     Every match in every note on the board, in reading order. Notes without
     a match fade back; matches are painted with the CSS Highlight API, so the
     notes' DOM (and what gets saved) is never touched. */
  let finder = null; // { bar, inp, count, hits: [{ id, range }], i }
  const canPaint = typeof Highlight === 'function' && typeof CSS !== 'undefined' && !!CSS.highlights;

  function textRanges(body, q) {
    const nodes = [], starts = [];
    let text = '';
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentNode.closest('figure.pic') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = tw.nextNode());) { nodes.push(n); starts.push(text.length); text += n.data; }
    const low = text.toLowerCase(), out = [];
    const at = (pos) => { let k = 0; while (k < nodes.length - 1 && starts[k + 1] <= pos) k++; return [nodes[k], pos - starts[k]]; };
    for (let i = low.indexOf(q); i >= 0 && out.length < 500; i = low.indexOf(q, i + q.length)) {
      const [a, ao] = at(i), [b, bo] = at(i + q.length - 1);
      const r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo + 1);
      out.push(r);
    }
    return out;
  }

  function find(q, startAt) {
    if (!board) return;
    if (!finder) {
      const inp = h('input', { class: 'find-input', placeholder: `Find on ${board.name}`, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Find on this board' });
      const count = h('span', { class: 'find-count muted' });
      const btn = (ic, title, fn) => { const b = h('button', { class: 'find-btn', title, 'aria-label': title, html: icon(ic) }); b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); }); return b; };
      const bar = h('div', { class: 'find-bar', role: 'search' }, h('span', { class: 'find-ic', html: icon('search') }), inp, count,
        btn('up', `Previous (${kb('shift+enter')})`, () => step(-1)), btn('down', `Next (${kb('enter')})`, () => step(1)), btn('x', 'Close (Esc)', closeFind));
      finder = { bar, inp, count, hits: [], i: -1, from: null };
      inp.addEventListener('input', () => { finder.from = sel; refind(true); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
      });
      vp.append(bar);
    }
    const s = getSelection();
    const picked = s && s.rangeCount && !s.isCollapsed && plane.contains(s.anchorNode) ? s.toString().trim() : '';
    if (q == null && picked && !/\n/.test(picked)) q = picked.slice(0, 80);
    finder.from = startAt || sel;
    if (q != null) finder.inp.value = q;
    finder.inp.focus(); finder.inp.select();
    refind(true);
  }

  function refind(jump) {
    if (!finder || !board) return;
    const q = finder.inp.value.trim().toLowerCase();
    const cur = finder.hits[finder.i];
    finder.hits = [];
    for (const m of readingOrder()) {
      const el = els.get(m.note); if (!el) continue;
      const rs = q ? textRanges(el.querySelector('.note-body'), q) : [];
      el.classList.toggle('found', rs.length > 0);
      for (const range of rs) finder.hits.push({ id: m.note, range });
    }
    vp.classList.toggle('finding', !!q);
    if (jump) {
      // the first match in (or after) the note find started from
      const order = readingOrder().map((m) => m.note), from = order.indexOf(finder.from);
      const k = from < 0 ? 0 : finder.hits.findIndex((x) => order.indexOf(x.id) >= from);
      finder.i = finder.hits.length ? Math.max(0, k) : -1;
    } else {
      // after an edit, stay on the same note
      const same = cur ? finder.hits.findIndex((x) => x.id === cur.id) : -1;
      finder.i = finder.hits.length ? Math.max(0, same) : -1;
    }
    paintFind(jump);
  }

  function step(d) {
    if (!finder || !finder.hits.length) return;
    finder.i = (finder.i + d + finder.hits.length) % finder.hits.length;
    paintFind(true);
  }

  function paintFind(move) {
    const { hits, i, count } = finder;
    const notes = new Set(hits.map((x) => x.id)).size;
    count.textContent = !finder.inp.value.trim() ? '' : hits.length ? `${i + 1} of ${hits.length}${notes > 1 ? ` in ${notes} notes` : ''}` : 'No matches';
    finder.bar.classList.toggle('none', !!finder.inp.value.trim() && !hits.length);
    if (canPaint) {
      CSS.highlights.set('fm-find', new Highlight(...hits.map((x) => x.range)));
      CSS.highlights.set('fm-find-on', hits[i] ? new Highlight(hits[i].range) : new Highlight());
    }
    const hit = hits[i];
    if (!hit || !move) return;
    const el = els.get(hit.id);
    const it = itemOf(hit.id);
    if (!el || !it) return;
    // bring the note into view only when it is not already (mostly) on screen
    const vr = vp.getBoundingClientRect(), nr = el.getBoundingClientRect();
    if (sel !== hit.id || nr.top < vr.top + 60 || nr.left < vr.left || nr.right > vr.right || nr.top > vr.bottom - 80) center(hit.id, false);
    else select(hit.id);
    // then scroll inside the note (and a wide code block) to the match
    requestAnimationFrame(() => {
      const body = el.querySelector('.note-body'), r = hit.range.getBoundingClientRect(), br = body.getBoundingClientRect(), z = view.z;
      if (r.top < br.top || r.bottom > br.bottom) body.scrollTop += (r.top - br.top - br.height / 3) / z;
      const pre = hit.range.startContainer.parentNode.closest && hit.range.startContainer.parentNode.closest('pre.code');
      if (pre) { const pr = pre.getBoundingClientRect(); if (r.left < pr.left || r.right > pr.right) pre.scrollLeft += (r.left - pr.left - pr.width / 3) / z; }
    });
  }

  function closeFind() {
    if (!finder) return;
    finder.bar.remove();
    finder = null;
    vp.classList.remove('finding');
    for (const el of els.values()) el.classList.remove('found');
    if (canPaint) { CSS.highlights.delete('fm-find'); CSS.highlights.delete('fm-find-on'); }
  }

  /* rebuild a note on this board from the library, after it was edited elsewhere (the note view) */
  function reloadNote(id) {
    const it = itemOf(id), old = els.get(id);
    if (!it || !old) return;
    const fresh = build(it);
    if (!fresh) return;
    if (group.has(id)) fresh.classList.add('sel');
    old.replaceWith(fresh);
    refreshFeet();
  }

  /* ── note operations ── */
  function freeSpot() {
    const W = vp.clientWidth, H = vp.clientHeight;
    let x = Math.round(((W / 2 - view.x) / view.z - 130) / GRID) * GRID;
    let y = Math.round(((H / 3 - view.y) / view.z - 40) / GRID) * GRID;
    while (board.items.some((m) => Math.abs(m.x - x) < 16 && Math.abs(m.y - y) < 16)) { x += 24; y += 24; }
    return { x, y };
  }

  /* a new note in the library, placed on this board */
  function addNote(at, focus, html = '<p><br></p>', extra = {}) {
    if (!board) return null;
    const p = at || freeSpot();
    const n = Store.createNote({ html, color: extra.color || (sel && noteOf(sel) ? noteOf(sel).color : 'moth'), ...Editor.derive(html) });
    const it = Store.place(board.id, n.id, { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID, w: extra.w || 260, h: extra.h || null, z: ++maxZ });
    plane.append(build(it));
    updateEmpty();
    select(n.id);
    Store.change('notes');
    if (focus) {
      focusBody(n.id);
      requestAnimationFrame(() => { const el = els.get(n.id); if (el && !el.contains(document.activeElement)) focusBody(n.id); });
    }
    return n;
  }

  /* put an existing library note on this board (or find it if it is already here) */
  function placeExisting(id) {
    if (!board || !noteOf(id)) return;
    if (!itemOf(id)) {
      const p = freeSpot();
      const it = Store.place(board.id, id, { x: p.x, y: p.y, z: ++maxZ });
      plane.append(build(it));
      updateEmpty();
      refreshFeet();
      Store.change('notes');
    }
    requestAnimationFrame(() => center(id));
  }
  function addExisting() {
    if (!board) return;
    const all = [...Store.S.notes.values()].filter((r) => !r.boards.includes(board));
    const anchor = vp.getBoundingClientRect();
    const toItem = (r, m) => ({ id: r.note.id, label: r.note.title || 'Untitled', labelHtml: m ? markPositions(r.note.title || 'Untitled', m.p) : null, icon: 'note', hint: r.boards.length ? r.boards.map((b) => b.name).join(', ') : 'on no board' });
    const list = (q) => {
      q = (q || '').toLowerCase();
      return all.map((r) => { const m = fuzzy(q, (r.note.title || '').toLowerCase()); return m && { r, m }; }).filter(Boolean)
        .sort((a, b) => (q ? b.m.s - a.m.s : (b.r.note.updated || 0) - (a.r.note.updated || 0))).slice(0, 80).map(({ r, m }) => toItem(r, q && m));
    };
    Popup.open({
      x: anchor.left + anchor.width / 2 - 150, y: anchor.top + 64, title: `Add a note to ${board.name}`, input: true, placeholder: 'Find a note',
      items: list(''), empty: all.length ? 'No note by that name' : 'Every note is already on this board',
      onQuery: (q) => Popup.update(list(q)),
      onPick: (x) => placeExisting(x.id),
    });
  }

  /* removing asks for a second, confirming action: the × turns into "Remove?" */
  let armed = null, armedAt = 0, armTimer = 0; // the notes waiting for that second Del
  const xTitle = () => `Remove from this board (Del, then confirm). The note stays in All notes. ${kb('shift+click')} deletes it everywhere.`;
  function disarm() {
    clearTimeout(armTimer);
    for (const id of armed || []) {
      const el = els.get(id); if (!el) continue;
      el.classList.remove('arming');
      const x = el.querySelector('.note-x');
      x.classList.remove('armed'); x.innerHTML = icon('x'); x.title = xTitle(); x.setAttribute('aria-label', 'Remove from this board');
    }
    armed = null;
  }
  function askRemove(ids) {
    ids = [].concat(ids).filter((id) => els.get(id));
    if (!ids.length) return;
    if (armed && armed.length === ids.length && ids.every((id) => armed.includes(id))) { const a = armed; disarm(); removeMany(a); return; }
    disarm();
    armed = ids; armedAt = 0; // set by a click on ×, whose double-click must not confirm too
    if (ids.length === 1) select(ids[0]);
    for (const id of ids) els.get(id).classList.add('arming');
    const x = els.get(ids.includes(sel) ? sel : ids[0]).querySelector('.note-x');
    x.classList.add('armed');
    // armed: the × turns red (with the count for several); the tooltip says what a second click does
    x.innerHTML = icon('x') + (ids.length > 1 ? `<span>${ids.length}</span>` : '');
    x.title = `Click again (or press Del or Enter) to remove ${ids.length > 1 ? `these ${ids.length} notes` : 'it'} from this board`;
    x.setAttribute('aria-label', x.title);
    armTimer = setTimeout(disarm, 3000);
  }
  addEventListener('pointerdown', (e) => { if (armed && !(e.target.closest && e.target.closest('.note-x.armed'))) disarm(); }, true);

  /* deleting notes themselves always asks first */
  async function confirmDeleteEverywhere(ids) {
    disarm();
    ids = [].concat(ids).filter((id) => Store.noteRef(id));
    if (ids.length > 1) {
      if (await Modal.confirm(`Delete ${ids.length} notes everywhere?`, `They will be removed from every board they are on and from All notes. You can undo right after.`, `Delete ${ids.length} notes`)) removeEverywhereMany(ids);
      return;
    }
    const ref = Store.noteRef(ids[0]); if (!ref) return;
    const t = ref.note.title ? `“${ref.note.title.slice(0, 40)}”` : 'This note';
    const where = ref.boards.length > 1 ? ` from all ${ref.boards.length} boards and` : ' from';
    if (await Modal.confirm('Delete this note everywhere?', `${t} will be removed${where} All notes. You can undo right after.`, 'Delete note')) removeEverywhere(ids[0]);
  }
  function dropEl(id) {
    if (els.get(id)) { els.get(id).remove(); els.delete(id); }
    unselect(id);
  }

  /* take a note off this board; it stays in the library (All notes) */
  function remove(id, quiet) {
    if (!board) return;
    const b = board, n = noteOf(id);
    const out = Store.unplace(b.id, id); if (!out) return;
    dropEl(id);
    updateEmpty();
    Store.change('notes');
    if (quiet) return;
    const t = n && n.title ? `“${n.title.slice(0, 28)}”` : 'Note';
    App.pushUndo(`${t} removed from ${b.name}. It is still in All notes.`, () => {
      b.items.splice(Math.min(out.index, b.items.length), 0, out.it);
      Store.index();
      if (board === b) { plane.append(build(out.it)); updateEmpty(); select(id); refreshFeet(); }
      Store.change('notes');
    });
  }

  /* take several notes off this board, with one undo */
  function removeMany(ids) {
    if (ids.length === 1) { remove(ids[0]); return; }
    if (!board) return;
    const b = board;
    const outs = [];
    for (const id of ids) { const out = Store.unplace(b.id, id); if (out) { outs.push(out); dropEl(id); } }
    if (!outs.length) return;
    updateEmpty();
    Store.change('notes');
    App.pushUndo(`${outs.length} notes removed from ${b.name}. They are still in All notes.`, () => {
      // put them back in reverse, so every saved index is right again
      for (const out of outs.slice().reverse()) b.items.splice(Math.min(out.index, b.items.length), 0, out.it);
      Store.index();
      if (board === b) { for (const out of outs) plane.append(build(out.it)); updateEmpty(); setGroup(outs.map((o) => o.it.note)); refreshFeet(); }
      Store.change('notes');
    });
  }

  /* delete the note itself, from the library and every board */
  function removeEverywhere(id, quiet) {
    const n = noteOf(id); if (!n) return;
    const saved = Store.deleteNote(id); if (!saved) return;
    dropEl(id);
    updateEmpty();
    Store.change('notes');
    if (quiet) return;
    const where = saved.placed.length > 1 ? ` from ${saved.placed.length} boards` : '';
    App.pushUndo(`Deleted ${n.title ? `“${n.title.slice(0, 28)}”` : 'note'}${where}`, () => {
      Store.restoreNote(saved);
      const mine = board && saved.placed.find((p) => p.board === board);
      if (mine) { plane.append(build(mine.it)); updateEmpty(); select(id); refreshFeet(); }
      Store.change('notes');
    });
  }

  function removeEverywhereMany(ids) {
    const saved = [];
    for (const id of ids) { const s = Store.deleteNote(id); if (s) { saved.push(s); dropEl(id); } }
    if (!saved.length) return;
    updateEmpty();
    Store.change('notes');
    App.pushUndo(`Deleted ${saved.length} notes`, () => {
      for (const s of saved.slice().reverse()) Store.restoreNote(s);
      if (board) {
        const mine = saved.map((s) => s.placed.find((p) => p.board === board)).filter(Boolean);
        for (const p of mine) plane.append(build(p.it));
        updateEmpty(); setGroup(mine.map((p) => p.it.note)); refreshFeet();
      }
      Store.change('notes');
    });
  }

  function duplicate(it) {
    const n = noteOf(it.note); if (!n) return null;
    const c = addNote({ x: it.x + 24, y: it.y + 24 }, false, n.html, { color: n.color, w: it.w, h: it.h });
    if (c) { c.tags = n.tags.slice(); refreshFeet(); }
    return c;
  }

  function setColor(n, c) {
    const el = els.get(n.id);
    if (el) { el.classList.remove('paper-' + n.color); el.classList.add('paper-' + c); }
    n.color = c;
    Store.change('notes');
  }

  /* tidy into rows, keeping reading order */
  function arrange() {
    if (!board || !board.items.length) return;
    const b = board, was = b.items.map((m) => [m, m.x, m.y]);
    App.pushUndo('Notes arranged', () => { for (const [m, x, y] of was) { m.x = x; m.y = y; if (board === b) place(m); } Store.change('notes'); });
    const gap = 24;
    const order = board.items.slice().sort((a, b) => (Math.round(a.y / 160) - Math.round(b.y / 160)) || a.x - b.x);
    const x0 = Math.round(Math.min(...order.map((n) => n.x)) / GRID) * GRID;
    const y0 = Math.round(Math.min(...order.map((n) => n.y)) / GRID) * GRID;
    // masonry: columns of the widest note, each note goes to the shortest column. The number
    // of columns depends only on the notes, never on the window, so a board arranges the
    // same way on a laptop and on a big display.
    const colW = Math.max(...order.map((n) => n.w));
    const cols = Math.min(order.length, clamp(Math.ceil(Math.sqrt(order.length * 1.5)), 1, 8));
    const heights = new Array(cols).fill(y0);
    for (const n of order) {
      const el = els.get(n.note);
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

  /* ── note foot: tags and backlinks ── */
  let backMap = new Map();
  function renderFoot(n, el = els.get(n.id)) {
    if (!el) return;
    const foot = el.querySelector('.note-foot');
    if (foot.querySelector('.tag-input')) return; // being edited
    const back = backMap.get(n.id) || [];
    const ref = Store.noteRef(n.id), others = ref ? ref.boards.length - 1 : 0;
    const sig = (n.tags || []).join('\u0001') + '|' + back.length + '|' + others;
    if (foot.dataset.sig === sig) return;
    foot.dataset.sig = sig;
    foot.innerHTML =
      `<div class="nf-tags">${(n.tags || []).map((t) => Tags.chip(t)).join('')}<button class="nf-add" tabindex="-1" title="${n.tags && n.tags.length ? 'Edit tags' : 'Add tags'} (T)" aria-label="Tags">${icon(n.tags && n.tags.length ? 'edit' : 'tag')}</button></div>` +
      `<div class="nf-meta">${others > 0 ? `<button class="nf-boards" tabindex="-1" title="On ${others + 1} boards: open it on another" aria-label="On ${others + 1} boards">${icon('board')}${others + 1}</button>` : ''}` +
      (back.length ? `<button class="backlinks" tabindex="-1" title="${back.length} ${back.length === 1 ? 'note links' : 'notes link'} here (L)" aria-label="${back.length} ${back.length === 1 ? 'note links' : 'notes link'} here">${icon('link')}${back.length}</button>` : '') + '</div>';
  }
  const refreshFeet = debounce(() => {
    if (!board) return;
    backMap = Store.backlinks();
    for (const it of board.items) { const n = noteOf(it.note); if (n) renderFoot(n); }
  }, 150);

  function tagNote(n) {
    const el = els.get(n.id); if (!el) return;
    const foot = el.querySelector('.note-foot');
    select(n.id);
    foot.classList.add('editing-tags');
    editTags(foot, n.tags || [], (tags) => {
      foot.classList.remove('editing-tags');
      foot.dataset.sig = '';
      if (tags && tags.join(' ') !== (n.tags || []).join(' ')) { n.tags = tags; n.updated = now(); Store.change('note'); }
      renderFoot(n);
    });
  }

  function backlinksMenu(n, foot) {
    const r = foot.getBoundingClientRect();
    Popup.open({
      x: r.left, y: r.bottom, title: 'Linked from',
      items: (backMap.get(n.id) || []).map((id) => { const ref = Store.noteRef(id); return ref && { id, label: ref.note.title || 'Untitled', hint: ref.board ? ref.board.name : 'on no board', icon: 'note' }; }).filter(Boolean),
      onPick: (it) => bus.emit('open-note', it.id),
    });
  }
  function boardsMenu(n, foot) {
    const r = foot.getBoundingClientRect();
    const ref = Store.noteRef(n.id); if (!ref) return;
    Popup.open({
      x: r.left, y: r.bottom, title: 'This note is on',
      items: ref.boards.map((b) => ({ id: b.id, label: b.name, icon: b === board ? 'tick' : 'board', hint: b === board ? 'this board' : '' })),
      onPick: (it) => { if (it.id !== board.id) bus.emit('goto-note', n.id, it.id); },
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
      addNote({ x: p.x - 40, y: p.y - 20 }, false, html + '<p><br></p>', { w: /figure/.test(html) ? 360 : 260 });
    }
  }

  return {
    init, mount, unmount, addNote, reloadNote, find, closeFind, finding: () => !!finder, remove, removeEverywhere, confirmDeleteEverywhere, placeExisting, addExisting, arrange, fit, center, key, select, focusBody, item: itemOf,
    zoom: () => view.z, view: () => ({ ...view }), zoomAt, toggleMap,
    // where a board point is drawn in the minimap, in client pixels (for tests)
    mapPoint: (x, y) => { const r = map.getBoundingClientRect(); return mapT && { x: r.left + mapT.ox + x * mapT.s, y: r.top + mapT.oy + y * mapT.s }; }, current: () => board, selected: () => sel, selection: picked, selectAll, COLORS,
    tagNote: (id) => { const n = noteOf(id); if (n) tagNote(n); },
    refreshChips: () => { for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body')); },
  };
})();
