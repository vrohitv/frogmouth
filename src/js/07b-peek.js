import { kb, now, h, esc, icon, Tags, bus } from './00-util.js';
import { Store } from './03-store.js';
import { Popup } from './05-ui.js';
import { Editor } from './06-editor.js';
import { Board } from './07-board.js';
import { App } from './10-app.js';

/* ── the note view: a referenced note, full size, over the board ─────
   Clicking an @note link opens the note right here instead of taking you
   to its board. It opens for reading: Enter opens it where it lives, A adds
   it to this board (or shows it, when it is already here), Esc closes. Click
   the text to edit it; links inside open in the same view, ‹ goes back. */
export const Peek = (() => {
  let scrim = null, card = null, body = null, trail = [], id = null;
  const seen = new Set(); // notes edited here, refreshed on the board when the view closes

  const ref = () => Store.noteRef(id);
  const onBoardView = () => Store.S.data && Store.S.data.ui.active.startsWith('b:');
  const here = () => (onBoardView() ? Board.current() : null);

  function open(noteId, fromLink) {
    if (!Store.noteRef(noteId)) return;
    if (scrim && id && id !== noteId && fromLink) trail.push(id);
    if (!scrim) build();
    show(noteId);
  }

  function build() {
    trail = [];
    card = h('div', { class: 'peek', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
    scrim = h('div', { class: 'scrim peek-scrim' }, card);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
    card.addEventListener('keydown', onKey);
    card.addEventListener('click', onClick);
    document.body.append(scrim);
  }

  /* what the view offers, given where the note is and where you are */
  function actions() {
    const r = ref(), b = here();
    const isHere = !!(b && r.boards.includes(b));
    const away = r.boards.filter((x) => x !== b);
    const out = [];
    if (isHere) out.push({ id: 'show', label: 'Show on this board', key: 'A' });
    else if (b) out.push({ id: 'add', label: `Add to ${b.name}`, key: 'A' });
    if (away.length) out.push({ id: 'go', label: `Open on ${away[0].name}${away.length > 1 ? ` (+${away.length - 1})` : ''}`, key: kb('enter'), primary: !isHere });
    return out;
  }

  function show(noteId) {
    Editor.flush();
    id = noteId;
    seen.add(id);
    const r = ref(), n = r.note;
    card.setAttribute('aria-label', n.title || 'Untitled');
    body = Editor.mount(n, (out) => {
      const renamed = out.title !== n.title;
      if (out.html === n.html && !renamed) return;
      n.html = out.html; n.text = out.text; n.title = out.title; n.updated = now();
      Store.change('note');
      if (renamed) { Board.refreshChips(); title(); }
    });
    body.setAttribute('aria-label', 'Note text: click to edit');
    // reading first; a click in the text (not on a link or image) starts editing there
    body.addEventListener('pointerdown', (e) => { if (!e.target.closest('a, .fref, .sref, figure.pic')) body.contentEditable = 'true'; });
    // and a click anywhere else goes back to reading, with no caret left in the text (not while its / or @ menu is open)
    const text = body, settle = () => {
      if (!text.isConnected || text.contains(document.activeElement)) return;
      if (Popup.isOpen()) { setTimeout(settle, 250); return; }
      text.contentEditable = 'false';
      const s = getSelection();
      if (s.rangeCount && text.contains(s.anchorNode)) s.removeAllRanges();
    };
    text.addEventListener('blur', () => setTimeout(settle, 120));
    const where = r.boards.length ? r.boards.map((b) => `<span class="pk-board">${icon('board')}${esc(b.name)}</span>`).join('') : '<span class="pk-board none">on no board</span>';
    card.replaceChildren(
      h('div', { class: 'pk-head' },
        trail.length ? h('button', { class: 'pk-back', 'data-a': 'back', title: `Back (${kb('alt+←')})`, 'aria-label': 'Back', html: icon('down') }) : null,
        h('i', { class: 'n-dot paper-' + n.color }),
        h('b', { class: 'pk-title' }),
        h('span', { class: 'pk-where', html: where }),
        h('button', { class: 'pk-x', 'data-a': 'close', title: 'Close (Esc)', 'aria-label': 'Close', html: icon('x') })),
      h('div', { class: 'note pk-paper paper-' + n.color }, body),
      h('div', { class: 'pk-foot' },
        h('span', { class: 'pk-tags', html: (n.tags || []).map((t) => Tags.chip(t)).join('') }),
        h('span', { class: 'pk-hint muted', text: 'Click the text to edit' }),
        ...actions().map((a) => h('button', { class: 'btn' + (a.primary ? ' primary' : ''), 'data-a': a.id, html: `${esc(a.label)} <kbd>${esc(a.key)}</kbd>` })),
        h('button', { class: 'btn', 'data-a': 'close', html: 'Close <kbd>Esc</kbd>' })));
    title();
    card.focus({ preventScroll: true });
  }
  function title() { const t = card && card.querySelector('.pk-title'); if (t && ref()) t.textContent = ref().note.title || 'Untitled'; }

  function act(a) {
    const noteId = id;
    if (a === 'close') close();
    else if (a === 'back') { if (trail.length) show(trail.pop()); }
    else if (a === 'add') { close(); Board.placeExisting(noteId); }
    else if (a === 'show') { close(); Board.center(noteId); }
    else if (a === 'go') { const b = here(), away = ref().boards.find((x) => x !== b); close(); if (away) App.gotoNote(noteId, away.id); }
  }

  function onClick(e) {
    const a = e.target.closest('[data-a]');
    if (a && !body.contains(a)) { e.preventDefault(); act(a.dataset.a); }
  }

  function onKey(e) {
    if (Popup.isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    e.stopPropagation(); // the board underneath never gets keys while the view is open
    if (body.contains(e.target)) return; // editing: keys type
    const k = e.key.toLowerCase(), list = actions();
    if (k === 'enter' && list.some((x) => x.id === 'go')) { e.preventDefault(); act('go'); }
    else if (k === 'a' && !e.metaKey && !e.ctrlKey) { const x = list.find((y) => y.id === 'add' || y.id === 'show'); if (x) { e.preventDefault(); act(x.id); } }
    else if (e.altKey && e.key === 'ArrowLeft' && trail.length) { e.preventDefault(); act('back'); }
  }

  function close() {
    if (!scrim) return;
    Editor.flush();
    scrim.remove();
    scrim = card = body = null;
    trail = []; id = null;
    for (const n of seen) Board.reloadNote(n); // the board shows what was edited here
    seen.clear();
  }

  bus.on('closed', close);
  return { open, close, isOpen: () => !!scrim, current: () => id };
})();
