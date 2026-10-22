import { modKey, h, esc, fuzzy, markPositions, toast, copyText, icon, bus, kb, relTime } from './00-util.js';
import { Bird } from './01-bird.js';
import { Store } from './03-store.js';
import { Board } from './07-board.js';
import { Secrets } from './08-secrets.js';
import { App } from './10-app.js';

/* ── palette: search everything, run commands ─────────────────────
   plain  notes, boards, secrets (names and tags, never values)
   >      commands      @  notes only      $  secrets only      #  boards only */
export const Palette = (() => {
  let el, inp, list, foot, items = [], idx = 0, built = -1, idxNotes = [], idxBoards = [], idxSecrets = [];

  // forget the search index (it holds note text) when the vault locks or closes
  bus.on('closed', () => { built = -1; idxNotes = []; idxBoards = []; idxSecrets = []; if (el && el.isConnected) el.remove(); });

  function build() {
    if (built === Store.S.rev) return;
    built = Store.S.rev;
    idxNotes = []; idxBoards = []; idxSecrets = [];
    for (const b of Store.S.data.boards) {
      idxBoards.push({ type: 'board', id: b.id, title: b.name, t: b.name.toLowerCase(), sub: `${b.items.length} ${b.items.length === 1 ? 'note' : 'notes'}`, opened: b.opened || 0 });
    }
    for (const { note: n, boards } of Store.S.notes.values()) {
      const title = n.title || 'Untitled';
      const tg = (n.tags || []).join(' ');
      const where = boards.length ? boards.map((b) => b.name).join(', ') : 'on no board';
      idxNotes.push({ type: 'note', id: n.id, title, t: title.toLowerCase(), body: ((n.text || '') + (tg ? '\n' + tg : '')).toLowerCase(), raw: (n.text || '') + (tg ? '\n' + tg : ''), sub: tg ? `${where}  ${tg}` : where, where, upd: n.updated || 0 });
    }
    for (const x of Store.S.data.secrets) {
      const tags = x.tags.join(' ');
      idxSecrets.push({ type: 'secret', id: x.id, title: x.key, t: x.key.toLowerCase(), body: (tags + ' ' + x.desc).toLowerCase(), sub: tags || x.desc });
    }
  }

  function snippet(raw, body, term) {
    const i = body.indexOf(term);
    if (i < 0) return '';
    const s = Math.max(0, i - 30), e = Math.min(raw.length, i + term.length + 50);
    const pre = (s > 0 ? '…' : '') + raw.slice(s, i), hit = raw.slice(i, i + term.length), post = raw.slice(i + term.length, e) + (e < raw.length ? '…' : '');
    return esc(pre.replace(/\n/g, ' ')) + '<mark>' + esc(hit) + '</mark>' + esc(post.replace(/\n/g, ' '));
  }

  function score(it, terms) {
    let total = 0, pos = [], snip = '', hit = '';
    for (const term of terms) {
      const m = fuzzy(term, it.t);
      if (m && m.s > 0) { total += m.s; pos = pos.concat(m.p); continue; }
      if (it.body) {
        const j = it.body.indexOf(term);
        if (j >= 0) { total += 30 - Math.min(20, j / 50); if (!snip && it.raw) { snip = snippet(it.raw, it.body, term); hit = term; } continue; }
      }
      if (m) { total += m.s; pos = pos.concat(m.p); continue; }
      return null;
    }
    return { s: total, p: pos, snip, hit };
  }

  function search(q) {
    build();
    let mode = '';
    if (/^[>@$#]/.test(q)) { mode = q[0]; q = q.slice(1); }
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (mode === '>') {
      const cmds = App.commands().filter((c) => !c.when || c.when());
      if (!terms.length) return cmds.map((c) => ({ ...c, type: 'cmd' }));
      return cmds.map((c) => { const m = fuzzy(terms.join(' '), c.title.toLowerCase()); return m && { ...c, type: 'cmd', s: m.s, p: m.p }; }).filter(Boolean).sort((a, b) => b.s - a.s);
    }
    const pools = mode === '@' ? [idxNotes] : mode === '$' ? [idxSecrets] : mode === '#' ? [idxBoards] : [idxNotes, idxBoards, idxSecrets];
    if (!terms.length) {
      // nothing typed: the notes you edited last, then boards by when you last opened them
      const recent = mode === '' || mode === '@' ? idxNotes.slice().sort((a, b) => b.upd - a.upd).slice(0, mode ? 60 : 10)
        .map((it) => ({ ...it, group: 'Recently edited', sub: `${relTime(it.upd)} · ${it.where}` })) : [];
      const boards = mode === '' || mode === '#' ? idxBoards.slice().sort((a, b) => b.opened - a.opened).map((it) => ({ ...it, group: 'Boards' })) : [];
      return recent.concat(boards, mode === '$' ? idxSecrets.slice(0, 60) : []);
    }
    const out = [];
    for (const pool of pools) for (const it of pool) {
      const r = score(it, terms);
      if (r) out.push({ ...it, s: r.s + (it.type === 'board' ? 5 : 0), p: r.p, snip: r.snip, hit: r.hit });
    }
    out.sort((a, b) => b.s - a.s || (b.upd || 0) - (a.upd || 0));
    return out.slice(0, 80);
  }

  const TYPE_ICON = { note: 'note', board: 'board', secret: 'key', cmd: 'cmd' };

  function render() {
    if (!items.length) {
      list.innerHTML = `<div class="pal-empty">${inp.value.startsWith('>') ? 'No command by that name.' : 'Nothing found. Try fewer letters, or <kbd>&gt;</kbd> for commands.'}</div>`;
      Bird.mood('rest');
      return;
    }
    list.innerHTML = items.map((it, i) =>
      (it.group && (i === 0 || items[i - 1].group !== it.group) ? `<div class="pal-group">${esc(it.group)}</div>` : '') +
      `<div class="pal-item${i === idx ? ' on' : ''}" data-i="${i}">${icon(TYPE_ICON[it.type] || 'cmd')}` +
      `<div class="pal-main"><div class="pal-title">${markPositions(it.title, it.p)}</div>${it.snip ? `<div class="pal-snip">${it.snip}</div>` : ''}</div>` +
      `<span class="pal-sub">${it.type === 'cmd' ? (it.key ? `<kbd>${esc(it.key)}</kbd>` : '') : esc(it.sub || '')}${it.type === 'secret' && i === idx ? ` <kbd>${kb('enter')} copy</kbd>` : ''}</span></div>`).join('');
    const on = list.querySelector(`[data-i="${idx}"]`);
    if (on) { on.scrollIntoView({ block: 'nearest' }); if (idx === 0 && on.previousElementSibling) list.scrollTop = 0; }
  }

  function update() {
    items = search(inp.value);
    idx = 0;
    render();
  }

  function show(prefix = '') {
    if (!Store.S.data) return;
    if (!el) {
      inp = h('input', { class: 'pal-input', placeholder: 'Search notes, boards, secrets.  > commands', spellcheck: 'false', autocomplete: 'off' });
      list = h('div', { class: 'pal-list' });
      foot = h('div', { class: 'pal-foot', html: `<span><kbd>↑↓</kbd> move</span><span><kbd>${kb('enter')}</kbd> open</span><span><kbd>&gt;</kbd> commands</span><span><kbd>@</kbd> notes</span><span><kbd>$</kbd> secrets</span><span><kbd>#</kbd> boards</span>` });
      el = h('div', { class: 'scrim pal-scrim' }, h('div', { class: 'pal', role: 'dialog', 'aria-label': 'Search' }, h('div', { class: 'pal-top', html: icon('search') }, inp), list, foot));
      el.addEventListener('mousedown', (e) => { if (e.target === el) hide(); });
      list.addEventListener('mousedown', (e) => { const it = e.target.closest('.pal-item'); if (it) { e.preventDefault(); idx = +it.dataset.i; run(items[idx], e); } });
      list.addEventListener('mousemove', (e) => { const it = e.target.closest('.pal-item'); if (it && +it.dataset.i !== idx) { idx = +it.dataset.i; render(); } });
      inp.addEventListener('input', update);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
        else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) run(items[idx], e); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); }
        else if (e.key === 'Tab') { e.preventDefault(); }
      });
    }
    document.body.append(el);
    inp.value = prefix;
    update();
    inp.focus();
    Bird.mood('wide');
    setTimeout(() => Bird.mood('rest'), 600);
  }

  function hide() { if (el && el.isConnected) el.remove(); }

  function run(it, e) {
    hide();
    if (it.type === 'cmd') return it.run();
    if (it.type === 'note') {
      App.gotoNote(it.id);
      // matched in the text: open the board's find bar on that match
      if (it.hit) requestAnimationFrame(() => requestAnimationFrame(() => { if (Board.item(it.id)) Board.find(it.hit, it.id); }));
      return;
    }
    if (it.type === 'board') return App.openTab('b:' + it.id);
    if (it.type === 'secret') {
      const x = Store.secret(it.id);
      if (modKey(e) || !x) { App.openTab('secrets'); Secrets.select(it.id); return; }
      copyText(x.value).then(() => toast(`Copied ${x.key}`));
    }
  }

  return { show, hide, isOpen: () => !!(el && el.isConnected), search };
})();
