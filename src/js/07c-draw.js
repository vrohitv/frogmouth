import { h, uid, icon, kb, clamp, bus } from './00-util.js';
import { Store } from './03-store.js';
import { Board } from './07-board.js';
import { App } from './10-app.js';

/* ── draw: boxes, frames and lines on a board ───────────────────────
   Shapes belong to one board (board.shapes, docs/format.md); notes are shared
   and only placed. Boxes and frames are elements in the board's plane, lines are
   paths in one SVG layer above them. The board treats boxes like notes for
   selection, dragging and keys; everything else about shapes lives here. */
export const Draw = (() => {
  const GAP = 6; // an attached line end stops this far short of the outline
  // the outline a line meets, by what it is attached to
  const KINDS = { note: 'box', rect: 'box', text: 'box', frame: 'box', ellipse: 'ellipse', diamond: 'diamond' };

  /* ── geometry (pure) ── */
  const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  /* where the ray from the rect's centre toward `toward` crosses its outline */
  function anchor(r, kind, toward) {
    const c = mid(r), dx = toward.x - c.x, dy = toward.y - c.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return c;
    const a = r.w / 2, b = r.h / 2;
    const t = kind === 'ellipse' ? 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b))
      : kind === 'diamond' ? 1 / (Math.abs(dx) / a + Math.abs(dy) / b)
      : Math.min(Math.abs(dx) > 1e-9 ? a / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? b / Math.abs(dy) : Infinity);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  const centreOf = (end) => (end.rect ? mid(end.rect) : end);
  const toward = (p, q, d) => { const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy); return l < 1e-9 ? p : { x: p.x + (dx / l) * d, y: p.y + (dy / l) * d }; };
  /* the points a line is drawn through, in board units. An end is {rect, kind} when
     attached, else a free point {x, y}. Elbows leave the middle of the facing sides. */
  function route(A, B, kind) {
    const ca = centreOf(A), cb = centreOf(B);
    if (kind !== 'elbow') {
      const pa = A.rect ? toward(anchor(A.rect, A.kind, cb), cb, GAP) : { x: A.x, y: A.y };
      const pb = B.rect ? toward(anchor(B.rect, B.kind, ca), ca, GAP) : { x: B.x, y: B.y };
      return [pa, pb];
    }
    const horiz = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
    const side = (end, c, other) => {
      if (!end.rect) return { x: end.x, y: end.y };
      const r = end.rect;
      if (horiz) return other.x >= c.x ? { x: r.x + r.w + GAP, y: c.y } : { x: r.x - GAP, y: c.y };
      return other.y >= c.y ? { x: c.x, y: r.y + r.h + GAP } : { x: c.x, y: r.y - GAP };
    };
    const pa = side(A, ca, cb), pb = side(B, cb, ca);
    if (horiz) { const mx = (pa.x + pb.x) / 2; return [pa, { x: mx, y: pa.y }, { x: mx, y: pb.y }, pb]; }
    const my = (pa.y + pb.y) / 2;
    return [pa, { x: pa.x, y: my }, { x: pb.x, y: my }, pb];
  }

  /* ── shapes on the mounted board ── */
  const FRAME = 'frame';
  const isBox = (x) => Store.BOXES.includes(x.type);
  const isThing = (x) => isBox(x) || x.type === FRAME; // has x, y, w, h
  const DEFAULT = { rect: [160, 96], ellipse: [160, 96], diamond: [160, 96], text: [160, 40], frame: [480, 320] };
  const LIMITS = { box: { w: 24, h: 24, W: 4000, H: 4000 }, frame: { w: 80, h: 60, W: 8000, H: 8000 } };
  const TOOLS = [
    ['select', 'cursor', 'Select', 'V'], ['rect', 'rect', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'O'],
    ['diamond', 'diamond', 'Diamond', 'D'], ['text', 'text', 'Text', 'X'],
    ['line', 'line', 'Line', 'L'], ['arrow', 'arrow', 'Arrow', 'C'],
  ];
  const KEYS = { v: 'select', r: 'rect', o: 'ellipse', d: 'diamond', x: 'text', l: 'line', c: 'arrow' };
  const LINE_TOOLS = ['line', 'arrow'];
  let vp, bar, board = null, tool = 'select', lastColor = 'moth', preview = null;
  const els = new Map(); // shape id -> element (boxes and frames)
  const wires = new Map(); // line id -> <g> in the wires layer
  const labels = new Map(); // line id -> its label element
  let layer = null, overlay = null, picked = []; // the SVG layer for lines; dots and end handles; the selection

  const list = () => Store.shapes(board);
  const get = (id) => board && list().find((x) => x.id === id);
  const geom = (id) => { const x = get(id); return x && isThing(x) ? x : undefined; };
  const known = (x) => isThing(x);

  function init(viewport) {
    vp = viewport;
    // the tool bar: its buttons never take focus, so the board keeps its keys
    bar = h('div', { class: 'hud-pill draw-bar', role: 'toolbar', 'aria-label': 'Drawing tools' });
    for (const [name, ic, label, key] of TOOLS) {
      if (name === 'line') bar.append(h('span', { class: 'draw-sep' }));
      const b = h('button', { class: 'draw-btn', 'data-tool': name, title: `${label} (${key})`, 'aria-label': label, 'aria-pressed': 'false', html: icon(ic), tabindex: '-1' });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => setTool(tool === name && name !== 'select' ? 'select' : name));
      bar.append(b);
    }
    for (const t of ['pointerdown', 'dblclick', 'wheel']) bar.addEventListener(t, (e) => e.stopPropagation());
    vp.append(bar);
    paintBar();
    bus.on('closed', () => { unmount(); });
  }
  function paintBar() {
    for (const b of bar.querySelectorAll('.draw-btn')) { const on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    vp.classList.toggle('drawing', tool !== 'select');
  }
  function setTool(name) {
    if (!TOOLS.some((t) => t[0] === name)) return;
    tool = name;
    if (bar) paintBar();
  }

  function mount(b) {
    unmount();
    board = b;
    setTool('select');
    const plane = Board.plane();
    for (const x of list()) if (known(x)) plane.append(build(x));
    layer = document.createElementNS(svgNS, 'svg');
    layer.setAttribute('class', 'wires');
    overlay = h('div', { class: 'draw-overlay' });
    plane.append(layer, overlay);
    redrawNow();
  }
  function unmount() {
    if (preview) { preview.remove(); preview = null; }
    for (const el of els.values()) el.remove();
    for (const el of labels.values()) el.remove();
    els.clear(); wires.clear(); labels.clear();
    if (layer) layer.remove();
    if (overlay) overlay.remove();
    layer = overlay = null; picked = [];
    if (ro) ro.disconnect();
    board = null;
    if (bar) setTool('select');
  }

  /* ── a box or frame element ── */
  const svgNS = 'http://www.w3.org/2000/svg';
  function build(x) {
    const text = h('div', { class: 'shape-text', spellcheck: 'false' });
    text.textContent = x.text || '';
    const edges = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('div', { class: 'rz rz-' + d, 'data-rz': d }));
    const el = h('div', { class: 'shape shape-' + x.type, 'data-id': x.id }, text, ...edges);
    if (x.type !== 'text') {
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'shape-bg');
      svg.append(document.createElementNS(svgNS, x.type === 'ellipse' ? 'ellipse' : x.type === 'diamond' ? 'polygon' : 'rect'));
      el.prepend(svg);
    }
    els.set(x.id, el);
    style(x, el);
    place(x);
    el.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('editing') && e.target.closest('.shape-text')) { e.stopPropagation(); return; }
      Board.grab(e, x.id);
    });
    el.addEventListener('dblclick', (e) => { if (e.target.closest('.rz')) return; e.preventDefault(); e.stopPropagation(); editText(x.id); });
    text.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the board and app never see keys typed into a shape
      // commit here too: blur does not always fire (a window without focus)
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); commitText(x, el); text.blur(); }
    });
    text.addEventListener('blur', () => commitText(x, el));
    return el;
  }
  function style(x, el = els.get(x.id)) {
    if (!el) return;
    el.className = `shape shape-${x.type} paper-${x.color || 'moth'}${x.fill === false ? ' nofill' : ''}${x.dash ? ' dash' : ''}${el.classList.contains('sel') ? ' sel' : ''}${el.classList.contains('editing') ? ' editing' : ''}`;
  }
  /* apply position and size; the outline is drawn at its real size, so corners and strokes never stretch */
  function place(x) {
    const el = els.get(x.id); if (!el) return;
    el.style.transform = `translate(${x.x}px,${x.y}px)`;
    el.style.width = x.w + 'px';
    el.style.height = x.h + 'px';
    el.style.zIndex = x.type === FRAME ? 0 : x.z || 1;
    const svg = el.firstChild;
    if (svg && svg.namespaceURI === svgNS) {
      const w = x.w, hh = x.h, sh = svg.firstChild, i = 1; // inset by half the stroke
      svg.setAttribute('width', w); svg.setAttribute('height', hh); svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
      if (x.type === 'ellipse') { sh.setAttribute('cx', w / 2); sh.setAttribute('cy', hh / 2); sh.setAttribute('rx', Math.max(1, w / 2 - i)); sh.setAttribute('ry', Math.max(1, hh / 2 - i)); }
      else if (x.type === 'diamond') sh.setAttribute('points', `${w / 2},${i} ${w - i},${hh / 2} ${w / 2},${hh - i} ${i},${hh / 2}`);
      else { sh.setAttribute('x', i); sh.setAttribute('y', i); sh.setAttribute('width', Math.max(1, w - 2 * i)); sh.setAttribute('height', Math.max(1, hh - 2 * i)); sh.setAttribute('rx', x.type === FRAME ? 4 : 6); }
    }
    redraw();
  }

  /* ── text in a shape: plain text only ── */
  function editText(id) {
    const x = get(id);
    if (x && x.type === 'line') { editLabel(x); return; }
    const el = els.get(id); if (!x || !el) return;
    const t = el.querySelector('.shape-text');
    el.classList.add('editing');
    t.contentEditable = 'plaintext-only';
    t.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function commitText(x, el) {
    if (!el.classList.contains('editing')) return;
    const t = el.querySelector('.shape-text');
    el.classList.remove('editing');
    t.contentEditable = 'false';
    const v = t.textContent.replace(/\u200b/g, '');
    // a text shape left empty goes away quietly, like an empty note
    if (x.type === 'text' && !v.trim()) { drop([x.id], true); return; }
    // grow to fit the text, so nothing is cut off
    let grew = false;
    if (x.type !== FRAME && t.scrollHeight > t.clientHeight + 1) { x.h = Math.min(Math.ceil(t.scrollHeight / 8) * 8, LIMITS.box.H); place(x); grew = true; }
    if (v !== x.text || grew) { x.text = v; Store.change('shapes'); }
  }

  /* ── drawing: drag to draw, click for the default size; then back to Select ── */
  function begin(e, from) {
    if (!board) return;
    if (from || LINE_TOOLS.includes(tool)) { beginLine(e, from); return; }
    const G = Board.GRID, snap = (v, alt) => (alt ? Math.round(v) : Math.round(v / G) * G);
    const kind = tool, sx = e.clientX, sy = e.clientY, p0 = Board.toBoard(sx, sy);
    let moved = false, last = e;
    preview = h('div', { class: 'shape-preview shape-' + kind });
    Board.plane().append(preview);
    const rectFor = (ev) => {
      const p1 = Board.toBoard(ev.clientX, ev.clientY);
      const x1 = snap(Math.min(p0.x, p1.x), ev.altKey), y1 = snap(Math.min(p0.y, p1.y), ev.altKey);
      const x2 = snap(Math.max(p0.x, p1.x), ev.altKey), y2 = snap(Math.max(p0.y, p1.y), ev.altKey);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };
    const show = (r) => Object.assign(preview.style, { transform: `translate(${r.x}px,${r.y}px)`, width: r.w + 'px', height: r.h + 'px' });
    preview.hidden = true;
    const mv = (ev) => {
      last = ev;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
      moved = true; preview.hidden = false; show(rectFor(ev));
    };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (preview) { preview.remove(); preview = null; }
      if (!board) return;
      const lim = kind === FRAME ? LIMITS.frame : LIMITS.box;
      let r;
      if (moved) { r = rectFor(ev || last); r.w = Math.max(r.w, lim.w); r.h = Math.max(r.h, lim.h); }
      else { const [w, hh] = DEFAULT[kind]; r = { x: snap(p0.x - w / 2, e.altKey), y: snap(p0.y - hh / 2, e.altKey), w, h: hh }; }
      const x = { id: uid(), type: kind, ...r, color: lastColor, text: '' };
      if (kind !== FRAME) x.z = Board.nextZ();
      Store.addShape(board, x);
      Board.plane().append(build(x));
      setTool('select');
      Board.select(x.id);
      Store.change('shapes');
      editText(x.id);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  /* ── operations the board calls with the selection ── */
  function drop(ids, quiet) {
    const b = board, saved = [];
    for (const id of ids) { const out = Store.dropShape(b, id); if (out) { saved.push(out); const el = els.get(id); if (el) { el.remove(); els.delete(id); } } }
    if (!saved.length) return;
    Board.setGroup(Board.selection().filter((id) => !ids.includes(id)));
    redraw();
    Store.change('shapes');
    if (quiet) return;
    App.pushUndo(saved.length === 1 ? 'Deleted a shape' : `Deleted ${saved.length} shapes`, () => {
      for (const sv of saved.slice().reverse()) Store.putShape(b, sv);
      if (board === b) { for (const sv of saved) if (known(sv.shape)) Board.plane().append(build(sv.shape)); Board.setGroup(saved.map((sv) => sv.shape.id)); redraw(); }
      Store.change('shapes');
    });
  }
  const remove = (ids) => drop(ids, false);
  function setColor(id, c) {
    const x = get(id); if (!x) return;
    x.color = c; lastColor = c;
    style(x);
    redraw();
    Store.change('shapes');
  }
  function duplicate(ids) {
    const out = [];
    for (const id of ids) {
      const x = geom(id); if (!x) continue;
      const c = { ...JSON.parse(JSON.stringify(x)), id: uid(), x: x.x + 24, y: x.y + 24 };
      if (x.type !== FRAME) c.z = Board.nextZ();
      Store.addShape(board, c);
      Board.plane().append(build(c));
      out.push(c.id);
    }
    if (out.length) Store.change('shapes');
    return out;
  }
  /* bring a box to the front, or send it behind every note and box */
  function order(id, front) {
    const x = geom(id); if (!x || x.z == null) return;
    if (front) x.z = Board.nextZ();
    else {
      const min = Board.zIndexMin();
      // nothing goes below 1 (frames sit at 0): make room by lifting everything else
      if (min <= 1) for (const m of [...board.items, ...list()]) if (m !== x && m.z != null) m.z += 1;
      x.z = min <= 1 ? 1 : min - 1;
      refreshZ();
    }
    place(x);
    Store.change('shapes');
  }
  function refreshZ() {
    for (const m of board.items) { const el = Board.el(m.note); if (el) el.style.zIndex = m.z || 1; }
    for (const x of list()) if (els.get(x.id)) els.get(x.id).style.zIndex = x.type === FRAME ? 0 : x.z || 1;
  }

  /* tool keys, when nothing is being typed and no modifier is held */
  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === 'Escape') { if (tool === 'select') return false; setTool('select'); return true; }
    const t = KEYS[e.key.toLowerCase()];
    if (!t) return false;
    setTool(t);
    return true;
  }

  /* ── what the board asks about ── */
  const ids = () => list().filter((x) => known(x) || x.type === 'line').map((x) => x.id);
  const bounds = () => list().filter(isThing).map((x) => ({ id: x.id, type: x.type, color: x.color, x: x.x, y: x.y, w: x.w, h: x.h }));
  /* boxes the marquee touches; frames only when it covers them completely */
  function within(r) {
    return list().filter(isThing).filter((x) => (x.type === FRAME
      ? x.x >= r.x && x.y >= r.y && x.x + x.w <= r.x + r.w && x.y + x.h <= r.y + r.h
      : x.x < r.x + r.w && x.x + x.w > r.x && x.y < r.y + r.h && x.y + x.h > r.y)).map((x) => x.id)
      .concat(lines().filter((x) => { const p = points(x); return p.length && p.every((q) => q.x >= r.x && q.y >= r.y && q.x <= r.x + r.w && q.y <= r.y + r.h); }).map((x) => x.id));
  }
  const carried = (sel) => sel.filter((id) => Board.item(id) || geom(id));
  const lines = () => list().filter((x) => x.type === 'line');
  /* the free ends of the selected lines; they move with the selection */
  function looseEnds(sel) {
    const out = [];
    for (const id of sel) { const x = get(id); if (x && x.type === 'line') for (const end of ['a', 'b']) if ('x' in x[end]) out.push({ p: x[end], x: x[end].x, y: x[end].y }); }
    return out;
  }
  const limits = (x) => (x.type === FRAME ? LIMITS.frame : LIMITS.box);

  /* ── lines ── */
  function resolve(end) {
    if (end.note) { const r = Board.rectOf(end.note); return r ? { rect: r, kind: 'box' } : null; }
    if (end.shape) { const x = geom(end.shape); return x ? { rect: x, kind: KINDS[x.type] } : null; }
    return { x: end.x, y: end.y };
  }
  function points(x) {
    const A = resolve(x.a), B = resolve(x.b);
    return A && B ? route(A, B, x.route === 'elbow' ? 'elbow' : 'straight') : [];
  }
  const paths = () => lines().map(points).filter((p) => p.length);
  function box(id) {
    const g = geom(id); if (g) return g;
    const x = get(id); if (!x || x.type !== 'line') return null;
    const pts = points(x); if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(1, Math.max(...xs) - Math.min(...xs)), h: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
  }
  /* the point halfway along a route, where its label sits */
  function halfway(pts) {
    if (pts.length === 4) return { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
    return { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
  }
  const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${+p.x.toFixed(1)} ${+p.y.toFixed(1)}`).join('');
  /* an arrowhead: a small triangle with its tip on the end of the line */
  function head(tip, from) {
    const dx = tip.x - from.x, dy = tip.y - from.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const bx = tip.x - ux * 11, by = tip.y - uy * 11;
    return d([tip, { x: bx - uy * 4.5, y: by + ux * 4.5 }, { x: bx + uy * 4.5, y: by - ux * 4.5 }]) + 'Z';
  }
  /* pull an end back so the stroke does not poke through its arrowhead */
  const shorten = (tip, from, by) => { const dx = from.x - tip.x, dy = from.y - tip.y, l = Math.hypot(dx, dy) || 1; return { x: tip.x + (dx / l) * Math.min(by, l), y: tip.y + (dy / l) * Math.min(by, l) }; };

  let raf = 0, ro = null;
  const redraw = () => { if (!raf && layer) raf = requestAnimationFrame(redrawNow); };
  function redrawNow() {
    raf = 0;
    if (!layer || !board) return;
    const seen = new Set();
    // a note grows as you type; lines attached to it follow
    if (!ro) ro = new ResizeObserver(() => redraw());
    for (const x of lines()) {
      seen.add(x.id);
      let g = wires.get(x.id);
      if (!g) g = buildWire(x);
      const pts = points(x);
      if (!pts.length) continue;
      for (const end of [x.a, x.b]) if (end.note && Board.el(end.note)) ro.observe(Board.el(end.note));
      const n = pts.length, ends = pts.slice();
      const hb = x.head === 'both', he = x.head === 'end' || hb;
      if (he) ends[n - 1] = shorten(pts[n - 1], pts[n - 2], 7);
      if (hb) ends[0] = shorten(pts[0], pts[1], 7);
      g.setAttribute('class', `wire paper-${x.color || 'moth'}${x.dash ? ' dash' : ''}${picked.includes(x.id) ? ' sel' : ''}`);
      g.children[0].setAttribute('d', d(pts));
      g.children[1].setAttribute('d', d(ends));
      const heads = [he && head(pts[n - 1], pts[n - 2]), hb && head(pts[0], pts[1])].filter(Boolean);
      g.querySelectorAll('.wire-head').forEach((p, i) => { if (i >= heads.length) p.remove(); });
      heads.forEach((hd, i) => {
        let p = g.querySelectorAll('.wire-head')[i];
        if (!p) { p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', 'wire-head'); g.append(p); }
        p.setAttribute('d', hd);
      });
      paintLabel(x, pts);
    }
    for (const [id, g] of wires) if (!seen.has(id)) { g.remove(); wires.delete(id); }
    for (const [id, el] of labels) if (!seen.has(id) || (!get(id).text && !el.isContentEditable)) { el.remove(); labels.delete(id); }
    paintOverlay();
  }
  function buildWire(x) {
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = x.id;
    for (const c of ['wire-hit', 'wire-path']) { const p = document.createElementNS(svgNS, 'path'); p.setAttribute('class', c); g.append(p); }
    g.addEventListener('pointerdown', (e) => { if (tool !== 'select') return; Board.grab(e, x.id); });
    g.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); editLabel(x); });
    layer.append(g);
    wires.set(x.id, g);
    return g;
  }
  function paintLabel(x, pts, force) {
    let el = labels.get(x.id);
    if (!x.text && !(el && el.isContentEditable) && !force) return;
    if (!el) {
      el = h('div', { class: 'wire-label', spellcheck: 'false', 'data-id': x.id });
      el.textContent = x.text;
      el.addEventListener('pointerdown', (e) => { if (el.isContentEditable) { e.stopPropagation(); return; } Board.grab(e, x.id); });
      el.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); editLabel(x); });
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); commitLabel(x, el); el.blur(); }
      });
      el.addEventListener('blur', () => commitLabel(x, el));
      overlay.append(el);
      labels.set(x.id, el);
    }
    const m = halfway(pts);
    el.style.transform = `translate(${m.x}px,${m.y}px) translate(-50%,-50%)`;
    el.classList.toggle('sel', picked.includes(x.id));
  }
  function editLabel(x) {
    if (!overlay) return;
    const pts = points(x); if (!pts.length) return;
    paintLabel(x, pts, true);
    const el = labels.get(x.id);
    el.contentEditable = 'plaintext-only';
    el.classList.add('editing');
    el.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function commitLabel(x, el) {
    if (!el.isContentEditable) return;
    el.contentEditable = 'false';
    el.classList.remove('editing');
    const v = el.textContent.replace(/\s+/g, ' ').trim();
    if (v !== x.text) { x.text = v; Store.change('shapes'); }
    if (!v) { el.remove(); labels.delete(x.id); }
  }

  /* the topmost note or box under a client point (frames and lines do not count) */
  function targetAt(cx, cy, not) {
    for (const el of document.elementsFromPoint(cx, cy)) {
      const t = el.closest && el.closest('.note, .shape:not(.shape-frame)');
      if (!t || !Board.plane().contains(t)) continue;
      const id = t.dataset.id;
      if (id === not) continue;
      return Board.el(id) === t ? { note: id } : els.get(id) === t ? { shape: id } : null;
    }
    return null;
  }
  const sameEnd = (p, q) => (p.note && p.note === q.note) || (p.shape && p.shape === q.shape);
  const elOfEnd = (e) => (e && (e.note ? Board.el(e.note) : e.shape ? els.get(e.shape) : null));
  function hover(t) {
    for (const el of Board.plane().querySelectorAll('.wire-target')) el.classList.remove('wire-target');
    const el = elOfEnd(t); if (el) el.classList.add('wire-target');
  }
  /* press, drag, release: each end attaches to the note or box under it, or stays a free point */
  function beginLine(e, from) {
    const kind = from ? 'arrow' : tool, G = Board.GRID, sx = e.clientX, sy = e.clientY;
    const free = (cx, cy, alt) => { const p = Board.toBoard(cx, cy); return alt ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(p.x / G) * G, y: Math.round(p.y / G) * G }; };
    const a = from || targetAt(e.clientX, e.clientY) || free(e.clientX, e.clientY, e.altKey);
    const x = { id: uid(), type: 'line', a, b: { ...free(e.clientX, e.clientY, true) }, head: kind === 'arrow' ? 'end' : 'none', color: lastColor, text: '' };
    // drawn live as a real line, kept only when it is long enough to mean something
    Store.addShape(board, x);
    redrawNow();
    const mv = (ev) => {
      const t = targetAt(ev.clientX, ev.clientY, a.note || a.shape);
      hover(t);
      x.b = t && !sameEnd(t, a) ? t : free(ev.clientX, ev.clientY, true);
      redraw();
    };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      hover(null);
      if (!board || !list().includes(x)) return;
      const t = targetAt(ev.clientX, ev.clientY, a.note || a.shape);
      x.b = t && !sameEnd(t, a) ? t : free(ev.clientX, ev.clientY, ev.altKey);
      const pts = points(x);
      // a click (the pointer barely moved) or a line too short to see
      const short = Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4 || pts.length < 2 || Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < 8;
      setTool('select');
      // a click without a real drag leaves nothing behind, unless it joined two different things
      const joined = (x.a.note || x.a.shape) && (x.b.note || x.b.shape) && !sameEnd(x.a, x.b);
      if (short && !joined) { Store.dropShape(board, x.id); redrawNow(); return; }
      Board.select(x.id);
      redrawNow();
      Store.change('shapes');
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  /* ── selection furniture: connector dots on one note or box, end handles on one line ── */
  function selected(ids) { picked = ids; if (layer) redrawNow(); }
  function paintOverlay() {
    if (!overlay) return;
    for (const el of [...overlay.querySelectorAll('.cdot, .wend')]) el.remove();
    for (const [id, g] of wires) g.classList.toggle('sel', picked.includes(id));
    if (picked.length !== 1 || tool !== 'select') return;
    const id = picked[0], x = get(id);
    if (x && x.type === 'line') {
      const pts = points(x); if (!pts.length) return;
      [['a', pts[0]], ['b', pts[pts.length - 1]]].forEach(([end, p]) => {
        const hd = h('div', { class: 'wend', title: 'Drag onto a note or box to attach', style: { transform: `translate(${p.x}px,${p.y}px)` } });
        hd.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dragEnd(e, x, end); });
        overlay.append(hd);
      });
      return;
    }
    const r = Board.rectOf(id) || (x && isBox(x) ? x : null);
    if (!r) return;
    const from = Board.item(id) ? { note: id } : { shape: id }, o = 14;
    for (const [px, py] of [[r.x + r.w / 2, r.y - o], [r.x + r.w + o, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h + o], [r.x - o, r.y + r.h / 2]]) {
      const dot = h('div', { class: 'cdot', title: 'Drag to connect', style: { transform: `translate(${px}px,${py}px)` } });
      dot.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); beginLine(e, from); });
      overlay.append(dot);
    }
  }
  function dragEnd(e, x, end) {
    const other = end === 'a' ? 'b' : 'a', was = x[end], G = Board.GRID;
    const mv = (ev) => {
      const o = x[other], t = targetAt(ev.clientX, ev.clientY, o.note || o.shape);
      hover(t);
      const p = Board.toBoard(ev.clientX, ev.clientY);
      x[end] = t || { x: Math.round(p.x), y: Math.round(p.y) };
      redraw();
    };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      hover(null);
      const o = x[other], t = targetAt(ev.clientX, ev.clientY, o.note || o.shape);
      const p = Board.toBoard(ev.clientX, ev.clientY);
      x[end] = t || (ev.altKey ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(p.x / G) * G, y: Math.round(p.y / G) * G });
      redrawNow();
      if (JSON.stringify(was) !== JSON.stringify(x[end])) Store.change('shapes');
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  return {
    anchor, route, KINDS, GAP,
    init, mount, unmount, tool: () => tool, setTool, begin, key,
    get, geom, el: (id) => els.get(id) || wires.get(id), place, redraw, lines, points, editText, remove, setColor, duplicate, order,
    ids, bounds, within, carried, looseEnds, paths, limits, box, selected,
  };
})();
