import { bus, toast, kb } from './00-util.js';
import { Store } from './03-store.js';
import { Board } from './07-board.js';
import { App } from './10-app.js';

/* ── history: undo and redo ──────────────────────────────────────────
   Two kinds of steps share one stack:
   - board steps, recorded by themselves: whenever a change lands on the mounted board
     (Store.change 'notes', 'shapes' or 'z'), the board is compared with how it was after
     the last step, and a difference becomes a step holding both states. So every gesture
     (drag, resize, nudge, colour, style, shape text, a line end, add, duplicate, paste,
     arrange) is undoable and redoable without each one knowing about history.
     A state is the board's placements, shapes, the colours of its notes and which notes
     the library holds; never note text, which keeps the editor's own undo.
   - deletions, which push a closure that puts things back exactly (App.pushUndo). They
     cannot be redone.
   Raising a note to the front is not a step of its own. */
export const History = (() => {
  const LIMIT = 100;
  const undos = [], redos = [];
  const last = new Map(); // board id -> its state after the last step
  let quiet = 0, task = 0, bumping = false, nudge = false;

  const strip = (o) => { const { z, ...rest } = o; return rest; };
  function state(b) {
    const items = b.items.map((it) => ({ ...it }));
    const shapes = JSON.parse(JSON.stringify(b.shapes || []));
    const colors = {}, notes = new Map();
    for (const it of b.items) { const r = Store.noteRef(it.note); if (r) { colors[it.note] = r.note.color; notes.set(it.note, r.note); } }
    const lib = new Set(Store.S.notes.keys());
    // what makes two states different: everything but the stacking order
    const key = JSON.stringify([items.map(strip), shapes.map(strip), colors]);
    return { board: b, items, shapes, colors, notes, lib, key };
  }
  // steps recorded in one go (one handler) belong together; a deletion's closure then replaces them
  function stamp() {
    if (!bumping) { bumping = true; queueMicrotask(() => { task++; bumping = false; }); }
    return task;
  }

  function record(what) {
    if (quiet || !Store.S.data || !['notes', 'shapes', 'z'].includes(what)) return;
    const b = Board.current(); if (!b) return;
    const before = last.get(b.id), now = state(b);
    last.set(b.id, now);
    const coalesce = nudge; nudge = false;
    if (!before || before.key === now.key) return;
    const top = undos[undos.length - 1], t = Date.now();
    // arrow-key nudges in a row are one step
    if (coalesce && top && top.nudge && top.board === b && t - top.at < 1200) { top.after = now; top.at = t; return; }
    undos.push({ board: b, before, after: now, at: t, nudge: coalesce, task: stamp() });
    if (undos.length > LIMIT) undos.shift();
    redos.length = 0;
  }

  /* a deletion: its closure puts things back. A board step recorded by the same handler is the
     deletion itself, so the closure takes its place */
  function push(label, fn) {
    const top = undos[undos.length - 1];
    if (top && top.board && top.task === task && bumping) undos.pop();
    const entry = { fn, label };
    undos.push(entry);
    if (undos.length > LIMIT) undos.shift();
    redos.length = 0;
    const b = Board.current(); if (b) last.set(b.id, state(b));
    toast(label, { action: () => { const i = undos.lastIndexOf(entry); if (i >= 0) { undos.splice(i, 1); run(() => fn()); } }, label: 'Undo' });
  }

  function run(fn) {
    quiet++;
    try { fn(); } finally { quiet--; }
    const b = Board.current(); if (b) last.set(b.id, state(b));
  }

  /* put a board back the way a state has it, keeping the objects (other steps hold them) */
  function restore(s) {
    const b = s.board;
    if (!Store.S.data.boards.includes(b)) return false;
    if (Board.current() !== b) App.openTab('b:' + b.id);
    run(() => {
      const had = new Set(b.items.map((it) => it.note));
      const byNote = new Map(b.items.map((it) => [it.note, it]));
      const put = (o, saved) => { for (const k of Object.keys(o)) if (!(k in saved)) delete o[k]; return Object.assign(o, JSON.parse(JSON.stringify(saved))); };
      b.items.splice(0, b.items.length, ...s.items.map((it) => (byNote.has(it.note) ? put(byNote.get(it.note), it) : { ...it })));
      const byId = new Map((b.shapes || []).map((x) => [x.id, x]));
      const shapes = s.shapes.map((x) => (byId.has(x.id) ? put(byId.get(x.id), x) : JSON.parse(JSON.stringify(x))));
      if (shapes.length) b.shapes = shapes; else delete b.shapes;
      Store.S.shaped++;
      // notes this state places that the library lost since (a paste that was undone) come back
      for (const [id, n] of s.notes) if (!Store.noteRef(id)) Store.S.data.notes.push(n);
      Store.index();
      // notes made after this state, now on no board, go again
      for (const id of had) {
        const r = Store.noteRef(id);
        if (r && !r.boards.length && !s.lib.has(id)) Store.S.data.notes.splice(Store.S.data.notes.indexOf(r.note), 1);
      }
      for (const [id, c] of Object.entries(s.colors)) { const r = Store.noteRef(id); if (r) r.note.color = c; }
      Store.index();
      Board.refresh();
      Store.change('notes');
    });
    return true;
  }

  // a step on a board deleted since is passed over
  function undo() {
    for (let e; (e = undos.pop());) {
      if (e.fn) { run(() => e.fn()); redos.length = 0; toast('Restored'); return; }
      if (restore(e.before)) { redos.push(e); return; }
    }
    toast('Nothing to undo');
  }
  function redo() {
    for (let e; (e = redos.pop());) if (restore(e.after)) { undos.push(e); return; }
    toast('Nothing to redo');
  }

  /* an empty new note or text box that went away by itself leaves no steps behind: the steps
     at the top that touched it go, down to the one that made it */
  function forget(id) {
    const has = (st, x) => st.items.some((it) => it.note === x) || st.shapes.some((sh) => sh.id === x);
    while (undos.length) {
      const top = undos[undos.length - 1];
      if (!top.board || !(has(top.before, id) || has(top.after, id))) break;
      undos.pop();
      if (!has(top.before, id)) break; // the step that made it
    }
    const b = Board.current(); if (b) last.set(b.id, state(b));
  }
  /* the step on top, and undoing exactly that step (a toast's Undo, when nothing came after) */
  const top = () => undos[undos.length - 1];
  function undoStep(e) { if (e && top() === e) undo(); else toast(`Other changes came after it: ${kb('mod+z')} steps back through them.`); }

  bus.on('change', record);
  bus.on('mounted', (b) => last.set(b.id, state(b)));
  // a different vault, or the same one read again from disk: old steps point at objects that are gone
  const clear = () => { undos.length = 0; redos.length = 0; last.clear(); };
  bus.on('loaded', clear);
  bus.on('closed', clear);

  return { undo, redo, push, forget, top, undoStep, size: () => undos.length, redoSize: () => redos.length, nudge: () => { nudge = true; } };
})();
