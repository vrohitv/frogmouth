import { modKey, clamp, now, h, debounce, esc, isTypingTarget, bus, toast, ls, icon, Tags, fuzzy, markPositions } from './00-util.js';
import { Store } from './03-store.js';
import { Popup, Modal, editTags } from './05-ui.js';
import { Editor } from './06-editor.js';
import { App } from './10-app.js';

/* ── board: an infinite canvas of draggable sticky notes ────────────
   A board shows placements ({note, x, y, w, h, z}) of notes from the
   library. Geometry lives on the placement, content on the note, so the
   same note can sit on several boards. Elements are keyed by note id. */
export const Board = (() => {
  const COLORS = ['straw', 'lichen', 'dusk', 'moth', 'rose', 'night'];
  const GRID = 8;
  let vp, plane, empty, board = null, view = { x: 0, y: 0, z: 1 }, sel = null, maxZ = 1;
  const els = new Map();
  let spaceDown = false;

  const saveView = debounce(() => board && ls.set('view:' + board.id, view), 300);
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
    maxZ = b.items.reduce((m, it) => Math.max(m, it.z || 1), 1);
    const frag = document.createDocumentFragment();
    for (const it of b.items) { const el = build(it); if (el) frag.append(el); }
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
  function updateEmpty() { empty.hidden = !!(board && board.items.length); }

  /* ── a note element ── */
  function build(it) {
    const n = noteOf(it.note);
    if (!n) return null;
    const body = Editor.mount(n, (out) => commit(n, out));
    const grip = h('div', { class: 'note-grip', title: 'Drag to move' },
      h('div', { class: 'note-swatches' }, COLORS.map((c, i) => h('button', { class: 'sw paper-' + c, title: `${c} (${i + 1})`, 'data-color': c, tabindex: '-1' }))),
      h('button', { class: 'note-x', title: 'Remove from this board (Del). The note stays in All notes. ⇧-click deletes it everywhere.', html: icon('x'), tabindex: '-1' }));
    const foot = h('div', { class: 'note-foot' });
    const edges = ['e', 's', 'se'].map((d) => h('div', { class: 'rz rz-' + d, 'data-rz': d, title: d === 's' ? 'Drag to resize. Double-click for auto height.' : 'Drag to resize' }));
    const el = h('div', { class: 'note paper-' + n.color, 'data-id': n.id }, grip, body, foot, ...edges);
    place(it, el);
    els.set(n.id, el);

    /* View mode: a click selects, a drag moves the note from anywhere on it.
       Edit mode (double-click, Enter): the body is editable and only the
       top edge or an Alt-drag moves it. */
    el.addEventListener('pointerdown', (e) => {
      select(n.id);
      bringFront(it);
      if (e.button !== 0) return;
      const t = e.target;
      const rz = t.closest('.rz');
      if (rz) { e.preventDefault(); e.stopPropagation(); resize(e, it, el, rz.dataset.rz); return; }
      if (t.closest('figure.pic, .note-grip button, .note-foot button, .tag-input')) return;
      const editing = el.classList.contains('editing');
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
      if (e.target.closest('.rz-s, .rz-se')) { it.h = null; place(it, el); Editor.refit(el); Store.change('notes'); return; }
      if (e.target.closest('figure.pic, .note-grip button, .rz') || el.classList.contains('editing')) return;
      e.preventDefault();
      editAt(n.id, e.clientX, e.clientY);
    });
    grip.addEventListener('pointerdown', (e) => {
      const sw = e.target.closest('.sw');
      if (sw) { e.preventDefault(); e.stopPropagation(); setColor(n, sw.dataset.color); return; }
      if (e.target.closest('.note-x')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) removeEverywhere(n.id); else remove(n.id); }
    });
    body.addEventListener('focus', () => { el.classList.add('editing'); select(n.id); });
    // leave edit mode once focus has really gone elsewhere (not to a / menu or picker)
    const settle = () => {
      if (!el.isConnected || el.contains(document.activeElement)) return;
      if (Popup.isOpen() || Modal.isOpen()) { setTimeout(settle, 250); return; }
      el.classList.remove('editing');
      body.contentEditable = 'false';
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
  }

  function commit(n, out) {
    const titleChanged = out.title !== n.title;
    if (out.html === n.html && !titleChanged) return;
    n.html = out.html; n.text = out.text; n.title = out.title; n.updated = now();
    Store.change('note');
    if (titleChanged) for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body'));
  }

  /* ── drag / resize ── */
  function drag(e, it, el) {
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
    let moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; el.classList.add('dragging'); }
      it.x = ox + dx; it.y = oy + dy;
      if (!ev.altKey) { it.x = Math.round(it.x / GRID) * GRID; it.y = Math.round(it.y / GRID) * GRID; }
      place(it, el);
    };
    const up = () => {
      el.classList.remove('dragging');
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { el._dragged = true; setTimeout(() => { el._dragged = false; }, 0); Store.change('notes'); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  /* dir: 'e' width, 's' height, 'se' both */
  function resize(e, it, el, dir) {
    const sx = e.clientX, sy = e.clientY, ow = it.w, oh = el.offsetHeight;
    el.classList.add('resizing');
    const mv = (ev) => {
      if (dir !== 's') it.w = clamp(Math.round((ow + (ev.clientX - sx) / view.z) / GRID) * GRID, 160, 2000);
      if (dir !== 'e') it.h = clamp(Math.round((oh + (ev.clientY - sy) / view.z) / GRID) * GRID, 80, 3000);
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
  function select(id) {
    if (sel === id) return;
    if (sel && els.get(sel)) els.get(sel).classList.remove('sel');
    sel = id;
    if (id && els.get(id)) els.get(id).classList.add('sel');
  }
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
    if ((k === 'n' || k === 'N') && !modKey(e) && !e.altKey) { addNote(null, true); return true; }
    if (k === '=' || k === '+') { zoomAt(view.z * 1.2); return true; }
    if (k === '-' || k === '_') { zoomAt(view.z / 1.2); return true; }
    if (k === '0' && !modKey(e)) { zoomAt(1); return true; }
    if (k === '!' || (k === '1' && e.shiftKey)) { fit(); return true; }
    if (k === 'Tab') { cycle(e.shiftKey ? -1 : 1); return true; }
    if (k === 'a' || k === 'A') { addExisting(); return true; }
    if (!n) {
      const pan = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[k];
      if (pan) { view.x += pan[0]; view.y += pan[1]; applyView(); return true; }
      return false;
    }
    if (k === 'Enter') { focusBody(n.id); return true; }
    if (k === 't' || k === 'T') { tagNote(n); return true; }
    if (k === 'Escape') { select(null); return true; }
    if ((k === 'Delete' || k === 'Backspace') && (e.shiftKey || modKey(e))) { removeEverywhere(n.id); return true; }
    if (k === 'Delete' || k === 'Backspace') { remove(n.id); return true; }
    if (/^[1-6]$/.test(k) && !modKey(e)) { setColor(n, COLORS[+k - 1]); return true; }
    if (modKey(e) && k.toLowerCase() === 'd') { duplicate(it); return true; }
    const d = e.shiftKey ? GRID * 5 : GRID;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[k];
    if (mv) { it.x += mv[0]; it.y += mv[1]; place(it); Store.change('notes'); return true; }
    return false;
  }

  function cycle(dir) {
    if (!board.items.length) return;
    const order = board.items.slice().sort((a, b) => (Math.round(a.y / 120) - Math.round(b.y / 120)) || a.x - b.x);
    const i = order.findIndex((m) => m.note === sel);
    const next = order[(i + dir + order.length) % order.length];
    center(next.note, false);
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
    const n = Store.createNote({ html, color: extra.color || (sel && noteOf(sel) ? noteOf(sel).color : 'straw'), ...Editor.derive(html) });
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

  /* take a note off this board; it stays in the library (All notes) */
  function remove(id, quiet) {
    if (!board) return;
    const b = board, n = noteOf(id);
    const out = Store.unplace(b.id, id); if (!out) return;
    if (els.get(id)) { els.get(id).remove(); els.delete(id); }
    if (sel === id) sel = null;
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

  /* delete the note itself, from the library and every board */
  function removeEverywhere(id, quiet) {
    const n = noteOf(id); if (!n) return;
    const saved = Store.deleteNote(id); if (!saved) return;
    if (els.get(id)) { els.get(id).remove(); els.delete(id); }
    if (sel === id) sel = null;
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

  function duplicate(it) {
    const n = noteOf(it.note); if (!n) return;
    const c = addNote({ x: it.x + 24, y: it.y + 24 }, false, n.html, { color: n.color, w: it.w, h: it.h });
    if (c) { c.tags = n.tags.slice(); refreshFeet(); }
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
    const gap = 24;
    const order = board.items.slice().sort((a, b) => (Math.round(a.y / 160) - Math.round(b.y / 160)) || a.x - b.x);
    const x0 = Math.round(Math.min(...order.map((n) => n.x)) / GRID) * GRID;
    const y0 = Math.round(Math.min(...order.map((n) => n.y)) / GRID) * GRID;
    const width = Math.max(560, vp.clientWidth / view.z - 80);
    // masonry: columns of the widest note, each note goes to the shortest column
    const colW = Math.max(...order.map((n) => n.w));
    const cols = Math.max(1, Math.floor((width + gap) / (colW + gap)));
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
      `<div class="nf-tags">${(n.tags || []).map((t) => Tags.chip(t)).join('')}<button class="nf-add" tabindex="-1" title="Edit tags (T)">${n.tags && n.tags.length ? icon('edit') : '+ tag'}</button></div>` +
      `<div class="nf-meta">${others > 0 ? `<button class="nf-boards" tabindex="-1" title="This note is also on other boards">${icon('board')}${others + 1} boards</button>` : ''}` +
      (back.length ? `<button class="backlinks" tabindex="-1">← ${back.length} ${back.length === 1 ? 'note links' : 'notes link'} here</button>` : '') + '</div>';
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
      onPick: (it) => bus.emit('goto-note', it.id),
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
    init, mount, unmount, addNote, remove, removeEverywhere, placeExisting, addExisting, arrange, fit, center, key, select, focusBody, item: itemOf,
    zoom: () => view.z, zoomAt, current: () => board, selected: () => sel, COLORS,
    tagNote: (id) => { const n = noteOf(id); if (n) tagNote(n); },
    refreshChips: () => { for (const el of els.values()) Editor.refreshChips(el.querySelector('.note-body')); },
  };
})();
