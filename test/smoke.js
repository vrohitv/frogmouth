import { $, $$, isMac, now, uid, esc, fuzzy, kb, kbFor, Tags } from '../src/js/00-util.js';
import { Bird } from '../src/js/01-bird.js';
import { Store } from '../src/js/03-store.js';
import { HL } from '../src/js/04-highlight.js';
import { Popup } from '../src/js/05-ui.js';
import { Peek } from '../src/js/07b-peek.js';
import { Editor } from '../src/js/06-editor.js';
import { Board } from '../src/js/07-board.js';
import { Secrets } from '../src/js/08-secrets.js';
import { NotesList } from '../src/js/08b-notes.js';
import { Palette } from '../src/js/09-palette.js';
import { App } from '../src/js/10-app.js';

/* Smoke tests. Only included by `python3 build.py --test`.
   Open test/frogmouth.html#smoke (served over http for OPFS),
   or #shot-board / #shot-secrets / #shot-palette for screenshots. */
(async () => {
  const mode = location.hash.slice(1);
  if (!mode) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const results = (window.__smoke = []);
  const ok = (name, cond, info = '') => results.push({ name, pass: !!cond, info: cond ? '' : String(info) });
  const keydown = (el, key, o = {}) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
    el.dispatchEvent(ev);
    return ev;
  };
  const type = async (s) => { for (const ch of s) { document.execCommand('insertText', false, ch); await Promise.resolve(); await Promise.resolve(); } };

  function demoData() {
    const d = Store.blankData();
    d.secrets.push(
      { id: uid(), key: 'AWS_ACCESS_KEY_ID', value: 'AKIA' + 'X'.repeat(16), tags: ['env:prod', 'aws'], desc: 'Deploy user', created: now(), updated: now() },
      { id: uid(), key: 'AWS_SECRET_ACCESS_KEY', value: 's3cr3t/value', tags: ['env:prod', 'aws'], desc: '', created: now(), updated: now() },
      { id: uid(), key: 'DATABASE_URL', value: 'postgres://app:pw@db:5432/app', tags: ['env:staging', 'db'], desc: 'Primary Postgres', created: now(), updated: now() },
      { id: uid(), key: 'STRIPE_SECRET_KEY', value: 'sk_test_123', tags: ['env:dev', 'billing'], desc: '', created: now(), updated: now() });
    return d;
  }

  await wait(50);
  if (mode.startsWith('shot')) {
    Store.openMemory(demoData(), 'demo');
    App.enter();
    await wait(400);
    if (mode === 'shot-secrets') App.openTab('secrets');
    if (mode === 'shot-tag-assist') {
      App.openTab('secrets'); await wait(80);
      Secrets.setFilter('aws ');
      const f = document.querySelector('.secrets .s-filter'); f.focus(); f.value = 'aws en'; f.setSelectionRange(6, 6); f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (mode === 'shot-palette') Palette.show('retry');
    if (mode === 'shot-slash') {
      const n = Board.addNote({ x: 760, y: 120 }, true, '<p>Deploy checklist</p><p><br></p>');
      await wait(50);
      Board.focusBody(n.id);
      await type('/');
      await type('co');
    }
    if (mode === 'shot-day') document.documentElement.dataset.theme = 'day';
    if (mode === 'shot-green') document.documentElement.dataset.accent = 'green';
    if (mode === 'shot-purple') { document.documentElement.dataset.accent = 'purple'; document.documentElement.dataset.theme = 'day'; }
    if (mode === 'shot-secret-edit') { App.openTab('secrets'); await wait(50); Secrets.edit(Store.S.data.secrets[1]); }
    if (mode === 'shot-arm') { await wait(300); const t = [...Store.S.notes.values()].find(({ note }) => note.title === 'Today').note; Board.select(t.id); keydown(document.body, 'Delete'); }
    if (mode === 'shot-measure') {
      await wait(800);
      const box = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return [r.top, r.height].map((v) => +v.toFixed(1)); };
      const eyes = (q) => [...document.querySelectorAll(q + ' .fm-ring')].map((e) => { const r = e.getBoundingClientRect(); return +(r.top + r.height / 2).toFixed(1); });
      const pre = document.createElement('pre'); pre.id = 'results';
      const t = document.querySelector('.sync-where'), ic = document.querySelector('.sync-ic svg');
      const tr = t.getBoundingClientRect(), ir = ic.getBoundingClientRect();
      pre.textContent = JSON.stringify({ pill: box('.hud-brand'), markEyes: eyes('.hud-bird'), wordEyes: eyes('.hud-logo'), syncTextMid: +(tr.top + tr.height / 2).toFixed(1), syncIconMid: +(ir.top + ir.height / 2).toFixed(1) });
      document.body.append(pre);
    }
    if (mode === 'shot-many') { for (let i = 1; i <= 30; i++) Store.S.data.boards.push({ id: uid(), name: ['Infra', 'Reading list', 'Sprint ' + i, 'Client ' + i, 'Ideas'][i % 5] + (i % 5 > 1 ? '' : ' ' + i), created: now(), items: [] }); Store.S.data.boards.forEach((b, i) => { b.opened = now() - i * 3.7e6; if (i === 3 || i === 9) b.pinned = true; }); Store.change('boards'); await wait(100); document.querySelector('.bp-more').click(); }
    if (mode === 'shot-keys') { await wait(300); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, code: 'Slash', bubbles: true, cancelable: true })); }
    if (mode === 'shot-welcome') { App.showWelcome(); await wait(1200); }
    if (mode === 'shot-asleep') { App.showWelcome(); await wait(900); Bird.mood('asleep'); await wait(1900); }
    if (mode === 'shot-asleep-hud') { await wait(500); Bird.mood('asleep'); await wait(1900); }
    if (mode === 'shot-gape') { App.showWelcome(); await wait(700); document.querySelector('.w-mark svg').classList.add('gaping'); }
    if (mode === 'shot-notes' || mode === 'shot-tags') {
      const infra = { id: uid(), name: 'Infra', created: now(), items: [] };
      Store.S.data.boards.push(infra); Store.index();
      const notes = [...Store.S.notes.values()].map((r) => r.note);
      notes.find((n) => n.title === 'Today').tags = ['todo', 'env:dev'];
      notes.find((n) => n.title === 'Welcome to frogmouth').tags = ['docs'];
      App.openTab('b:' + infra.id);
      const a = Board.addNote({ x: 80, y: 80 }, false, '<p>Rotate DB credentials</p><p>Quarterly. Uses <span class="sref" contenteditable="false" data-secret="' + Store.S.data.secrets[2].id + '">DATABASE_URL</span>, see <a class="mention" contenteditable="false" data-note="' + notes[1].id + '">@Retry</a></p>');
      a.tags = ['runbook', 'env:prod', 'db']; a.updated = now() - 3600e3 * 5;
      const b = Board.addNote({ x: 460, y: 80 }, false, '<p>Incident 2026-10-02</p><p>API gateway timeouts after deploy. Root cause: pool size.</p>', { color: 'rose' });
      b.tags = ['incident', 'env:prod']; b.updated = now() - 86400e3 * 3;
      Store.change('notes');
      App.openTab(mode === 'shot-notes' ? 'notes' : 'b:' + infra.id);
    }
    if (mode === 'shot-boards') {
      for (const name of ['Infra', 'Reading list', 'Sprint 42']) Store.S.data.boards.push({ id: uid(), name, created: now(), items: [] });
      Store.change('boards');
      const long = Board.addNote({ x: 880, y: 120 }, false, '<p>Scrolling note</p>' + Array.from({ length: 14 }, (_, i) => `<p>line ${i + 1} of a note taller than its box</p>`).join('') +
        '<pre class="code" data-lang="sh"><code>' + esc('kubectl -n payments rollout restart deployment/api-gateway && kubectl -n payments rollout status deployment/api-gateway --timeout=120s') + '</code></pre>');
      Object.assign(Board.item(long.id), { h: 300, w: 320 }); Store.change('notes'); App.openTab('secrets'); App.openTab('b:' + Store.S.data.boards[0].id);
      await wait(200); const lb = document.querySelector(`.note[data-id="${long.id}"] .note-body`); lb.scrollTop = 120; lb.querySelector('pre').scrollLeft = 60;
    }
    if (mode === 'shot-table') {
      Board.addNote({ x: 760, y: 120 }, false, '<p>Service ports</p><table><thead><tr><th>service</th><th>port</th><th>owner</th></tr></thead><tbody><tr><td>api-gateway</td><td>8080</td><td>platform</td></tr><tr><td>payments</td><td>8443</td><td>billing</td></tr><tr><td>kafka</td><td>9092</td><td>data</td></tr></tbody></table><p>Staging adds 10000 to each.</p>', { w: 340 });
    }
    if (mode === 'shot-multi' || mode === 'shot-find') {
      for (let i = 0; i < 9; i++) Board.addNote({ x: 760 + (i % 3) * 280, y: 120 + Math.floor(i / 3) * 170 }, false, `<p>${['Kafka runbook', 'Deploy steps', 'On-call notes', 'Retro', 'Kafka lag alert', 'DB failover', 'Reading', 'Ideas', 'Infra costs'][i]}</p><p>${i % 4 === 0 ? 'restart the kafka broker, then watch consumer lag' : 'nothing about streams here'}</p>`);
      await wait(50);
      if (mode === 'shot-multi') {
        const ids = Board.current().items.slice(-9).map((m) => m.note);
        Board.select(ids[0]);
        for (const id of [ids[1], ids[4]]) document.querySelector(`.note[data-id="${id}"] .note-body`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
        const vp = document.querySelector('.board-vp'), r = document.querySelector(`.note[data-id="${ids[6]}"]`).getBoundingClientRect();
        vp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: true, clientX: r.left - 20, clientY: r.top - 16 }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: r.right + 120, clientY: r.bottom + 30 }));
      } else {
        Board.select(null);
        Board.find('kafka');
      }
    }
    if (mode === 'shot-recent') Palette.show('');
    if (mode === 'shot-peek') {
      const t = [...Store.S.notes.values()].find(({ note }) => note.title === 'Retry with backoff').note;
      Peek.open(t.id);
    }
    if (mode === 'shot-add') { await wait(300); document.querySelector('.nav-add').click(); }
    if (mode === 'shot-trail') {
      const d = Store.S.data, q3 = { id: uid(), name: 'Q3 Launch', created: now(), items: [] }, infra = { id: uid(), name: 'Infra', created: now(), items: [] };
      d.boards.push(q3, infra); Store.index(); Store.change('boards');
      const hub = Board.addNote({ x: 760, y: 120 }, false, `<p>Projects</p><ul><li><a class="bref" contenteditable="false" data-board="${q3.id}">Q3 Launch</a> ship by Sept</li><li><a class="bref" contenteditable="false" data-board="${infra.id}">Infra</a> on-call, costs</li></ul>`, { color: 'dusk' });
      await wait(60);
      document.querySelector(`.note[data-id="${hub.id}"] a.bref`).click(); await wait(60);
      const n2 = Board.addNote({ x: 120, y: 160 }, false, `<p>Launch plan</p><p>Infra prerequisites: <a class="bref" contenteditable="false" data-board="${infra.id}">Infra</a></p>`, { color: 'sea' });
      await wait(60);
      document.querySelector(`.note[data-id="${n2.id}"] a.bref`).click(); await wait(80);
    }
    if (mode === 'shot-papers' || mode === 'shot-papers-day') {
      if (mode === 'shot-papers-day') document.documentElement.dataset.theme = 'day';
      Board.COLORS.forEach((c, i) => Board.addNote({ x: 80 + (i % 5) * 230, y: 520 + Math.floor(i / 5) * 150 }, false, `<p>${c[0].toUpperCase() + c.slice(1)}</p><p>Key ${i + 1}. Calm in both themes, with <code>code</code> and a #tag.</p>`, { color: c, w: 210 }));
      Board.fit();
      if (mode === 'shot-papers') { await wait(500); Board.zoomAt(1.1, 300, 600); }
    }
    document.body.dataset.ready = '1';
    return;
  }

  try {
    /* ── pure units ── */
    const js = HL.highlight('const x = 1; // hi\nfunction f(a) { return "s"; }', 'js');
    ok('highlight js keywords', js.includes('<span class="t-k">const</span>') && js.includes('t-c') && js.includes('t-s') && js.includes('<span class="t-f">f</span>'), js);
    ok('highlight escapes html', !HL.highlight('a < b && "<b>"', 'js').includes('<b>'));
    ok('detect python', HL.detect('def f(x):\n    return x') === 'py');
    ok('detect json', HL.detect('{"a": 1}') === 'json');
    ok('detect go', HL.detect('package main\nfunc main() {}') === 'go');
    ok('highlight html', HL.highlight('<a href="x">t</a>', 'html').includes('t-p'));

    const frag = Editor.sanitize('<p onclick="x()">hi<scr' + 'ipt>alert(1)</scr' + 'ipt><img src="http://evil/x.png" onerror="y()"><a href="javascript:alert(1)">bad</a><a href="https://ok.dev">good</a><a class="mention" data-note="n1">@A</a><span class="fref" data-path="files/a.excalidraw">a</span><span class="fref" data-path="../etc/passwd">p</span><figure class="pic" data-src="assets/x.png" data-h="200"></figure></p>');
    const box = document.createElement('div'); box.append(frag);
    const sh = box.innerHTML;
    ok('sanitize drops script/handlers', !/script|onclick|onerror|javascript:|evil/.test(sh), sh);
    ok('sanitize keeps safe links + chips', sh.includes('https://ok.dev') && sh.includes('data-note="n1"') && sh.includes('files/a.excalidraw') && sh.includes('data-h="200"'), sh);
    ok('sanitize rejects path traversal', !sh.includes('passwd'), sh);


    ok('tagged files open as themselves', Editor.openAs('', 'files/x.html') === 'text/html' && Editor.openAs('', 'a.svg') === 'image/svg+xml' && Editor.openAs('', 'files/a.excalidraw').startsWith('text/plain') && Editor.openAs('image/png', 'a.png') === 'image/png' && Editor.openAs('', 'r.pdf') === 'application/pdf' && Editor.openAs('application/zip', 'a.zip') === 'application/zip');
    ok('shortcut labels in Mac style', kbFor(true, 'mod+shift+p') === '⌘⇧P' && kbFor(true, 'mod+enter') === '⌘↵' && kbFor(true, 'alt+j') === '⌥J' && kbFor(true, 'mod+shift+backspace') === '⌘⇧⌫' && kbFor(true, 'shift+click') === '⇧ click' && kbFor(true, 'mod+b / mod+i') === '⌘B / ⌘I', [kbFor(true, 'mod+shift+p'), kbFor(true, 'shift+click')].join(' '));
    ok('shortcut labels in Windows/Linux style', kbFor(false, 'mod+shift+p') === 'Ctrl+Shift+P' && kbFor(false, 'mod+enter') === 'Ctrl+Enter' && kbFor(false, 'alt+j') === 'Alt+J' && kbFor(false, 'mod+shift+backspace') === 'Ctrl+Shift+Backspace' && kbFor(false, 'mod+wheel') === 'Ctrl+wheel' && kbFor(false, 'shift+del') === 'Shift+Del', [kbFor(false, 'mod+shift+p'), kbFor(false, 'mod+wheel')].join(' '));
    ok('this machine gets its own style', kb('mod+k') === (isMac ? '⌘K' : 'Ctrl+K'));
    ok('fuzzy subsequence', fuzzy('rtb', 'retry with backoff') && !fuzzy('zzz', 'retry'));

    /* ── app in memory mode ── */
    Store.openMemory(demoData(), 'test');
    App.enter();
    await wait(100);
    ok('board renders notes', $$('.note').length === 3, $$('.note').length);
    ok('code block highlighted on load', !!$('.note pre.code .t-k'));
    {
      const pre = $('.note pre.code'), code = pre.querySelector('code');
      const lines = code.textContent.replace(/\n$/, '').split('\n').length;
      ok('code blocks number every line', code.querySelectorAll('.ln').length === lines && lines > 3, code.querySelectorAll('.ln').length + ' vs ' + lines);
      ok('line numbers are not part of the code text', !/^\s*1/.test(code.textContent) && code.textContent.startsWith('async function'), JSON.stringify(code.textContent.slice(0, 20)));
      const ref = [...Store.S.notes.values()].find(({ note }) => note.title === 'Retry with backoff');
      ok('saved note and search text have no line numbers', !/class="ln"/.test(ref.note.html) && /async function retry/.test(ref.note.text));
    }
    {
      // a comment spanning lines stays coloured on every line, and nothing leaks between lines
      const n2 = Board.addNote({ x: 1500, y: 600 }, false, '<p>Multi</p><pre class="code" data-lang="js"><code>' + esc('/* one\ntwo */\nlet x = 1;') + '</code></pre>');
      await wait(10);
      const c2 = $(`.note[data-id="${n2.id}"] pre.code code`);
      const lns = [...c2.querySelectorAll('.ln')];
      ok('multi-line tokens are split per line', lns.length === 3 && lns[0].querySelector('.t-c') && lns[1].querySelector('.t-c') && lns[2].querySelector('.t-k') && c2.textContent === '/* one\ntwo */\nlet x = 1;\n', c2.innerHTML);
      Board.removeEverywhere(n2.id, true);
    }
    ok('mention label refreshed', $$('.note a.mention').some((a) => a.textContent === '@Today'));
    ok('inferred titles', [...Store.S.notes.values()].every(({ note }) => note.title || Editor.derive(note.html).title));

    // view mode vs edit mode, resizing from edges
    const first = $('.note');
    ok('notes start in view mode', !first.querySelector('.note-body').isContentEditable);
    const ptr = (type, target, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }));
    const w0 = first.offsetWidth, h0 = first.offsetHeight;
    const se = first.querySelector('.rz-se').getBoundingClientRect();
    ptr('pointerdown', first.querySelector('.rz-se'), se.left + 5, se.top + 5);
    ptr('pointermove', window, se.left + 85, se.top + 65);
    ptr('pointerup', window, se.left + 85, se.top + 65);
    ok('corner resizes both ways', first.offsetWidth > w0 + 60 && first.offsetHeight > h0 + 40, `${w0}x${h0} -> ${first.offsetWidth}x${first.offsetHeight}`);
    const w1 = first.offsetWidth, h1 = first.offsetHeight;
    const edge = first.querySelector('.rz-e').getBoundingClientRect();
    ptr('pointerdown', first.querySelector('.rz-e'), edge.left + 3, edge.top + 20);
    ptr('pointermove', window, edge.left - 37, edge.top + 60);
    ptr('pointerup', window, edge.left - 37, edge.top + 60);
    ok('right edge resizes width only', first.offsetWidth < w1 - 24 && first.offsetHeight === h1, `${w1}x${h1} -> ${first.offsetWidth}x${first.offsetHeight}`);
    {
      // the left and top edges resize too, keeping the opposite edges exactly in place
      const it = Board.item(first.dataset.id), z = Board.zoom();
      const dragEdge = (d, dx, dy) => {
        const r = first.querySelector('.rz-' + d).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        ptr('pointerdown', first.querySelector('.rz-' + d), x, y); ptr('pointermove', window, x + dx * z, y + dy * z); ptr('pointerup', window, x + dx * z, y + dy * z);
      };
      it.h = null; first.style.height = ''; // start from automatic height (often a fraction of a pixel)
      const rect = () => first.getBoundingClientRect();
      const B0 = rect().bottom;
      const R = it.x + it.w, B = it.y + first.getBoundingClientRect().height / z, H = first.offsetHeight;
      dragEdge('w', -48, 30);
      ok('left edge grows the note leftwards, right edge fixed', it.x + it.w === R && it.w >= 160 && it.x % 8 === 0 && first.offsetHeight === H, JSON.stringify(it));
      dragEdge('n', 25, -40);
      ok('top edge grows the note upwards, bottom edge fixed', Math.abs(it.y + it.h - B) < 1e-9 && Math.abs(rect().bottom - B0) < 0.01 && it.y % 8 === 0 && it.x + it.w === R, JSON.stringify(it) + ' ' + B0 + ' ' + rect().bottom);
      const W2 = it.w, H2 = it.h;
      dragEdge('nw', 64, 48);
      ok('top-left corner resizes both ways, bottom-right corner fixed', it.x + it.w === R && Math.abs(it.y + it.h - B) < 1e-9 && it.w === W2 - 64 && Math.abs(it.h - (H2 - 48)) < 1e-9, JSON.stringify(it));
      dragEdge('ne', 40, 0); dragEdge('sw', 0, 40);
      ok('the other corners resize too', it.w === W2 - 64 + 40 && Math.abs(it.y + it.h - (B + 40)) <= 4, JSON.stringify(it)); // the bottom edge snaps to the grid
      ok('left and top edges have handles', ['n', 'w', 'nw', 'ne', 'sw'].every((d) => first.querySelector('.rz-' + d)));
    }
    const t0 = first.style.transform, br = first.querySelector('.note-body').getBoundingClientRect();
    ptr('pointerdown', first.querySelector('.note-body p'), br.left + 40, br.top + 30);
    ptr('pointermove', window, br.left + 140, br.top + 90);
    ptr('pointerup', window, br.left + 140, br.top + 90);
    ok('drag from body moves note, no editing', first.style.transform !== t0 && !first.classList.contains('editing'), t0 + ' -> ' + first.style.transform);
    first.querySelector('.note-body').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: br.left + 140, clientY: br.top + 90 }));
    ok('double-click enters edit mode', first.classList.contains('editing') && first.querySelector('.note-body').isContentEditable);
    keydown(first.querySelector('.note-body'), 'Escape');
    await wait(450);
    ok('escape leaves edit mode', !first.classList.contains('editing') && !first.querySelector('.note-body').isContentEditable);

    // markdown shortcuts must leave the caret in the new block, not on the line above
    {
      const nm = Board.addNote({ x: 1400, y: 100 }, false, '<p>Caret check</p><p>first line</p><p><br></p>');
      await wait(10);
      Board.focusBody(nm.id);
      const bm = $(`.note[data-id="${nm.id}"] .note-body`);
      await type('- ');
      await type('milk');
      const li = bm.querySelector('ul li');
      ok('- then typing lands in the bullet', li && li.textContent === 'milk' && bm.querySelectorAll('p')[1].textContent === 'first line', bm.innerHTML);
      document.execCommand('insertParagraph'); document.execCommand('insertParagraph');
      await type('1. ');
      await type('one');
      const oli = bm.querySelector('ol li');
      ok('1. then typing lands in the numbered item', oli && oli.textContent === 'one', bm.innerHTML);
      document.execCommand('insertParagraph'); document.execCommand('insertParagraph');
      await type('[] ');
      await type('task');
      const tli = bm.querySelector('ul[data-type="todo"] li');
      ok('[] then typing lands in the todo', tli && tli.textContent === 'task', bm.innerHTML);
      document.execCommand('insertParagraph'); document.execCommand('insertParagraph');
      await type('> ');
      await type('said');
      const bq = bm.querySelector('blockquote');
      ok('> then typing lands in the quote', bq && bq.textContent === 'said', bm.innerHTML);
      document.execCommand('insertParagraph');
      keydown(bm, 'Enter'); // Enter on the empty quote line leaves the quote
      await type('## ');
      await type('Next');
      ok('## then typing lands in the heading', bm.querySelector('h2') && bm.querySelector('h2').textContent === 'Next', bm.innerHTML);
      ok('no blocks left nested in paragraphs', !bm.querySelector('p ul, p ol, p blockquote, p h2'), bm.innerHTML);
      bm.blur();
      Board.remove(nm.id, true);
    }

    // new note + typing + markdown shortcuts
    const n = Board.addNote({ x: 900, y: 100 }, false);
    await wait(10);
    Board.focusBody(n.id);
    const body = $(`.note[data-id="${n.id}"] .note-body`);
    await type('Shopping list');
    keydown(body, 'Enter');
    document.execCommand('insertParagraph');
    await type('# ');
    await type('Heading here');
    ok('# makes h1', !!body.querySelector('h1') && body.querySelector('h1').textContent === 'Heading here', body.innerHTML);
    document.execCommand('insertParagraph');
    await type('- ');
    await type('milk');
    ok('- makes bullet list', !!body.querySelector('ul li'), body.innerHTML);
    document.execCommand('insertParagraph'); document.execCommand('insertParagraph');
    await type('[] ');
    await type('task');
    ok('[] makes todo', !!body.querySelector('ul[data-type="todo"] li[data-checked="false"]'), body.innerHTML);
    document.execCommand('insertParagraph'); document.execCommand('insertParagraph');
    await type('use `npm ci`');
    ok('backticks make inline code', !!body.querySelector('p code') && body.querySelector('p code').textContent === 'npm ci', body.innerHTML);

    // slash menu → code block
    document.execCommand('insertParagraph');
    await type('/');
    ok('slash opens popup', Popup.isOpen());
    await type('code');
    keydown(body, 'Enter');
    const pre = body.querySelector('pre.code');
    ok('slash code inserts code block', !!pre, body.innerHTML);
    if (pre) {
      await type('if (x) {');
      keydown(body, 'Enter');
      await type('return 1');
      const t = pre.textContent;
      ok('code auto-indents after {', t.includes('if (x) {\n  return 1'), JSON.stringify(t));
      ok('code highlights while typing', !!pre.querySelector('.t-k'), pre.innerHTML);
      keydown(body, 'Tab');
      ok('tab inserts spaces in code', pre.textContent.includes('return 1  '), JSON.stringify(pre.textContent));
      keydown(body, 'z', { metaKey: isMac, ctrlKey: !isMac });
      ok('code undo', !pre.textContent.includes('return 1  '), JSON.stringify(pre.textContent));
      keydown(body, 'Enter', { metaKey: isMac, ctrlKey: !isMac });
      ok('mod+enter leaves code block', !getSelection().anchorNode.parentNode.closest || !(getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentNode).closest('pre'));
    }

    // @ mention
    await type('see @');
    ok('@ opens popup', Popup.isOpen());
    await type('Welc');
    keydown(body, 'Enter');
    ok('@ inserts mention', !!body.querySelector('a.mention'), body.innerHTML);
    ok('mention stays inside its block', body.querySelector('a.mention') && body.querySelector('a.mention').parentNode !== body, body.innerHTML);
    ok('no blocks nested in paragraphs', !body.querySelector(':scope > p > :is(ul,ol,pre,p,h1,h2,h3)'), body.innerHTML);
    body.blur();
    await wait(400);
    ok('note commits title', n.title === 'Shopping list', n.title);
    ok('note html saved', n.html.includes('<pre class="code"') && !n.html.includes('t-k'), n.html);
    ok('serialized code keeps text', /if \(x\) \{/.test(n.html));

    // backlinks
    await wait(300);
    const welcomeId = [...Store.S.notes.values()].find(({ note }) => note.title === 'Welcome to frogmouth').note.id;
    ok('backlinks footer', /link/.test($(`.note[data-id="${welcomeId}"] .note-foot`).textContent), $(`.note[data-id="${welcomeId}"] .note-foot`).innerHTML);

    // images: zoom inside own frame
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC';
    const ni = Board.addNote({ x: 900, y: 600 }, false, `<p>Diagram</p><figure class="pic" contenteditable="false" data-src="${png}"></figure>`);
    await wait(150);
    const fig = $(`.note[data-id="${ni.id}"] figure.pic`);
    const img = fig && fig.querySelector('img');
    ok('image hydrates', !!img && img.naturalWidth === 8, img && img.naturalWidth);
    if (img) {
      const before = img.style.transform;
      const r = fig.getBoundingClientRect();
      fig.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true }));
      ok('wheel zooms image only', img.style.transform !== before && Board.zoom() === 1, before + ' -> ' + img.style.transform);
    }

    // board ops
    const count = Board.current().items.length;
    Board.select(n.id);
    keydown(document.body, 'Delete');
    ok('first Del only asks', Board.current().items.length === count && /Remove\?/.test($(`.note[data-id="${n.id}"] .note-x`).textContent));
    keydown(document.body, 'Escape');
    ok('Esc cancels the removal', !$(`.note[data-id="${n.id}"] .note-x.armed`) && Board.current().items.length === count);
    Board.select(n.id);
    keydown(document.body, 'Delete');
    $(`.note[data-id="${n.id}"] .note-x`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    ok('Del removes the note from the board only', Board.current().items.length === count - 1 && !!Store.noteRef(n.id));
    keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
    ok('undo puts it back on the board', Board.current().items.length === count && !!$(`.note[data-id="${n.id}"]`));
    Board.arrange();
    ok('arrange keeps notes', Board.current().items.length === count);

    // a note reference (@link) is only a link: it never puts the linked note on this board
    {
      const here = Board.current(), d = Store.S.data;
      const other = { id: uid(), name: 'Elsewhere', created: now(), items: [] }; d.boards.push(other);
      const away = Store.createNote({ html: '<p>Lives elsewhere</p>' }); Store.place(other.id, away.id, { x: 0, y: 0 });
      const loose = Store.createNote({ html: '<p>On no board</p>' });
      Store.index(); Store.change('notes');
      const before = here.items.map((m) => m.note).join();
      const host = Board.addNote({ x: 40, y: 3400 }, false, `<p>Host</p><p>See <a class="mention" contenteditable="false" data-note="${away.id}">@x</a> and <a class="mention" contenteditable="false" data-note="${loose.id}">@y</a></p>`);
      await wait(350);
      const onHere = () => here.items.map((m) => m.note).filter((id) => id !== host.id).join();
      ok('linking notes does not put them on this board', onHere() === before && !here.items.some((m) => m.note === away.id || m.note === loose.id) && !$(`.note[data-id="${away.id}"]`) && !$(`.note[data-id="${loose.id}"]`));
      // + Note on the board: a new note, or an existing one
      $('.nav-add').click(); await wait(20);
      ok('+ Note offers a new note or an existing one', Popup.isOpen() && /New note/.test($('.pop').textContent) && /Add an existing note/.test($('.pop').textContent));
      [...$$('.pop .pop-item')].find((x) => /existing/.test(x.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await wait(20);
      ok('...and "existing" opens the note picker for this board', Popup.isOpen() && /Add a note to/.test($('.pop').textContent) && /Lives elsewhere/.test($('.pop').textContent));
      Popup.close();
      // the note view: a link opens the note right here, full size; you stay on this board
      const pk = () => $('.peek'), btns = () => [...$$('.peek .pk-foot .btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
      $(`.note[data-id="${host.id}"] a.mention[data-note="${away.id}"]`).click(); await wait(60);
      ok('clicking a note link opens the note in the note view, on this board', Peek.isOpen() && Peek.current() === away.id && Board.current() === here && /Lives elsewhere/.test(pk().querySelector('.note-body').textContent));
      ok('the view says where the note lives and offers add / open', /Elsewhere/.test(pk().querySelector('.pk-where').textContent) && btns().some((b) => /^Add to /.test(b)) && btns().some((b) => /^Open on Elsewhere/.test(b)), JSON.stringify(btns()));
      ok('it opens for reading, not editing', !pk().querySelector('.note-body').isContentEditable && document.activeElement === pk());
      ok('the board underneath gets no keys', (keydown(pk(), 'n'), here.items.length === before.split(',').filter(Boolean).length + 1));
      keydown(pk(), 'Escape'); await wait(30);
      ok('Esc closes it, nothing added', !Peek.isOpen() && onHere() === before);
      // Enter opens it where it lives
      $(`.note[data-id="${host.id}"] a.mention[data-note="${away.id}"]`).click(); await wait(40);
      keydown(pk(), 'Enter'); await wait(80);
      ok('Enter opens it on its board', !Peek.isOpen() && Board.current() === other && other.items.length === 1);
      App.openTab('b:' + here.id); await wait(60);
      // A adds it here
      $(`.note[data-id="${host.id}"] a.mention[data-note="${loose.id}"]`).click(); await wait(40);
      ok('a note on no board says so, and can only be added here', /on no board/.test(pk().querySelector('.pk-where').textContent) && !btns().some((b) => /^Open on/.test(b)));
      keydown(pk(), 'a'); await wait(80);
      ok('A adds it to this board and closes the view', !Peek.isOpen() && here.items.some((m) => m.note === loose.id) && !!$(`.note[data-id="${loose.id}"]`));
      // already here: A shows it instead
      $(`.note[data-id="${host.id}"] a.mention[data-note="${loose.id}"]`).click(); await wait(40);
      ok('a note already on this board offers Show instead of Add', btns().some((b) => /^Show on this board/.test(b)) && !btns().some((b) => /^Add to/.test(b)));
      keydown(pk(), 'a'); await wait(80);
      ok('Show closes the view and brings the note forward', !Peek.isOpen() && Board.selected() === loose.id);
      // links inside the view open in the same view; back returns
      const chain = Board.addNote({ x: 400, y: 3400 }, false, `<p>Chain</p><p>to <a class="mention" contenteditable="false" data-note="${away.id}">@x</a></p>`);
      $(`.note[data-id="${host.id}"] a.mention[data-note="${loose.id}"]`).click(); await wait(40);
      Peek.open(chain.id, true); await wait(30);
      pk().querySelector(`a.mention[data-note="${away.id}"]`).click(); await wait(40);
      ok('a link inside the view opens in the same view, with a way back', Peek.current() === away.id && !!pk().querySelector('.pk-back'));
      pk().querySelector('.pk-back').click(); await wait(30);
      ok('back returns to the note before', Peek.current() === chain.id);
      // editing in the view shows on the board when it closes
      const pb = pk().querySelector('.note-body');
      pb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); pb.focus();
      const s0 = getSelection(); s0.selectAllChildren(pb.lastElementChild); s0.collapseToEnd();
      await type(' edited');
      pb.blur(); await wait(350);
      keydown(pk(), 'Escape'); await wait(40);
      ok('edits in the view are saved and the board shows them', /to @?\S* ?edited|edited/.test(chain.text) && /edited/.test($(`.note[data-id="${chain.id}"] .note-body`).textContent), chain.text);
      Board.removeEverywhere(chain.id, true);
      ok('the board only changed by what you added', onHere() === [before, loose.id].filter(Boolean).join(','), onHere());
      for (const id of [host.id, away.id, loose.id]) Board.removeEverywhere(id, true);
      d.boards.splice(d.boards.indexOf(other), 1); Store.index(); Store.change('boards');
    }

    // board links: @@ (or the @ menu) links a board; following links leaves a trail you can go back along
    {
      const mod = { metaKey: isMac, ctrlKey: !isMac }, d = Store.S.data, home = Board.current();
      const proj = { id: uid(), name: 'Q3 Launch', created: now(), items: [] }, infra = { id: uid(), name: 'Infra', created: now(), items: [] };
      d.boards.push(proj, infra); Store.index(); Store.change('boards');
      const itemsBefore = home.items.length;
      const hub = Board.addNote({ x: 40, y: 3600 }, false, '<p>Projects</p><p><br></p>');
      await wait(40);
      Board.focusBody(hub.id);
      const hb = $(`.note[data-id="${hub.id}"] .note-body`);
      await type('@@q3');
      const list = $('.pop') ? $('.pop').textContent : '';
      ok('@@ lists boards only', Popup.isOpen() && /Q3 Launch/.test(list) && !/Welcome to frogmouth/.test(list), list.slice(0, 120));
      keydown(hb, 'Enter');
      const chip = hb.querySelector('a.bref');
      ok('picking one inserts a board link chip', !!chip && chip.dataset.board === proj.id && chip.textContent === 'Q3 Launch', hb.innerHTML);
      await type(' and @infra');
      const list2 = $('.pop') ? $('.pop').textContent : '';
      ok('@ lists boards too, next to notes and files', /Infra/.test(list2) && /board/.test(list2), list2.slice(0, 120));
      keydown(hb, 'Enter');
      hb.blur(); await wait(400);
      ok('board links are saved in the note', (hub.html.match(/class="bref"/g) || []).length === 2 && hub.html.includes(`data-board="${proj.id}"`));
      ok('linking boards puts nothing on the board', home.items.length === itemsBefore + 1);
      const clean = document.createElement('div'); clean.append(Editor.sanitize(`<a class="bref" data-board="${proj.id}" href="javascript:x" onclick="x()">Q3</a>`));
      ok('board links survive sanitizing, and nothing else does', clean.innerHTML === `<a class="bref" contenteditable="false" data-board="${proj.id}">Q3</a>`, clean.innerHTML);
      proj.name = 'Q3 Launch!'; Store.change('boards'); await wait(30);
      ok('a board link shows the board\'s current name', $(`.note[data-id="${hub.id}"] a.bref[data-board="${proj.id}"]`).textContent === 'Q3 Launch!');
      // follow: Home -> Q3 Launch, then from there to Infra
      $(`.note[data-id="${hub.id}"] a.bref[data-board="${proj.id}"]`).click(); await wait(60);
      ok('clicking a board link opens the board', Board.current() === proj);
      ok('a trail shows where you came from', !$('.hud-trail').hidden && $('.hud-trail').textContent.includes(home.name) && /Q3 Launch!$/.test($('.hud-trail').textContent), $('.hud-trail').textContent);
      const step2 = Board.addNote({ x: 0, y: 0 }, false, `<p>Next</p><p><a class="bref" contenteditable="false" data-board="${infra.id}">Infra</a> <a class="bref" contenteditable="false" data-board="${home.id}">home</a></p>`);
      await wait(30);
      $(`.note[data-id="${step2.id}"] a.bref[data-board="${infra.id}"]`).click(); await wait(60);
      ok('the trail grows as you follow links', Board.current() === infra && $$('.trail-step').length === 2, $('.hud-trail').textContent);
      keydown(document.body, 'ArrowLeft', { altKey: true });
      await wait(60);
      ok(`${kb('alt+←')} goes back one step`, Board.current() === proj && $$('.trail-step').length === 1);
      $(`.note[data-id="${step2.id}"] a.bref[data-board="${home.id}"]`).click(); await wait(60);
      ok('a link back to a board on the trail goes back there, no loop', Board.current() === home && $('.hud-trail').hidden);
      $(`.note[data-id="${hub.id}"] a.bref[data-board="${proj.id}"]`).click(); await wait(60);
      $$('.trail-step')[0].click(); await wait(60);
      ok('clicking a step goes back to it', Board.current() === home && $('.hud-trail').hidden);
      $(`.note[data-id="${hub.id}"] a.bref[data-board="${proj.id}"]`).click(); await wait(60);
      App.openTab('b:' + infra.id); await wait(60);
      ok('opening a board another way clears the trail', $('.hud-trail').hidden);
      App.openTab('b:' + home.id); await wait(60);
      d.boards.splice(d.boards.indexOf(infra), 1); Store.index(); Store.change('boards'); await wait(30);
      ok('a link to a deleted board is struck through', $(`.note[data-id="${hub.id}"] a.bref[data-board="${infra.id}"]`).classList.contains('missing'));
      Board.removeEverywhere(hub.id, true);
      for (const n of [...proj.items]) Board.removeEverywhere(n.note, true);
      d.boards.splice(d.boards.indexOf(proj), 1); Store.index(); Store.change('boards');
    }

    // zoom percent and minimap
    {
      const frameP = () => new Promise((r) => requestAnimationFrame(() => r()));
      Board.zoomAt(1); await frameP(); await frameP();
      ok('the zoom control shows the zoom', $('.nav-pct').textContent === '100%');
      Board.zoomAt(0.5); await frameP(); await frameP();
      ok('the zoom percent follows the zoom', $('.nav-pct').textContent === '50%', $('.nav-pct').textContent);
      $('.nav-pct').click(); await frameP(); await frameP();
      ok('clicking the percent goes back to 100%', Board.zoom() === 1 && $('.nav-pct').textContent === '100%');
      [...$$('.nav-btn')].find((b) => b.textContent === '+').click();
      ok('+ zooms in', Board.zoom() > 1);
      Board.zoomAt(1); await frameP(); await frameP();
      const mm = $('.minimap');
      ok('the minimap shows when the board has notes', !mm.hidden && mm.width > 0);
      // clicking a note's spot in the minimap brings that note to the middle of the screen
      const target = Board.current().items[0], tH = $(`.note[data-id="${target.note}"]`).offsetHeight;
      const cx = target.x + target.w / 2, cy = target.y + tH / 2, pt = Board.mapPoint(cx, cy);
      const selBefore = Board.selection().length;
      mm.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: pt.x, clientY: pt.y, pointerId: 7 }));
      mm.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: pt.x, clientY: pt.y, pointerId: 7 }));
      const v = Board.view(), vpEl = $('.board-vp');
      const mid = [(vpEl.clientWidth / 2 - v.x) / v.z, (vpEl.clientHeight / 2 - v.y) / v.z];
      ok('clicking in the minimap moves the view there', Math.abs(mid[0] - cx) < 0.01 && Math.abs(mid[1] - cy) < 0.01, JSON.stringify([mid, [cx, cy]]));
      ok('a minimap click does not deselect or touch notes', Board.selection().length === selBefore && !$('.marquee'));
      keydown(document.body, 'm'); await frameP(); await frameP();
      ok('M hides the minimap and remembers it', mm.hidden && localStorage.getItem(Object.keys(localStorage).find((k) => /minimap/.test(k))) === 'false');
      keydown(document.body, 'm'); await frameP(); await frameP();
      ok('M shows it again', !mm.hidden);
    }

    // a display change (external monitor unplugged, then plugged back in) never moves notes,
    // keeps the same board point centred, and returning gives back exactly the same view
    {
      const shell = $('.shell'), vpEl = $('.board-vp');
      // stand-ins for a different display: the app's shell sized like that screen
      const size = (w, hh) => Object.assign(shell.style, { right: 'auto', bottom: 'auto', width: w + 'px', height: hh + 'px' });
      const unsize = () => Object.assign(shell.style, { right: '', bottom: '', width: '', height: '' });
      Board.zoomAt(0.85); Board.zoomAt(0.85 * 1.2, 333, 211); // an arbitrary, non-round camera
      await wait(350); // let the camera save
      const big = Board.view(), W = vpEl.clientWidth, H = vpEl.clientHeight;
      const mid = (v, w, hh) => [(w / 2 - v.x) / v.z, (hh / 2 - v.y) / v.z];
      const notesBefore = JSON.stringify(Board.current().items.map((m) => [m.note, m.x, m.y, m.w, m.h]));
      const rev = Store.S.rev;
      const sizes = [[1280, 720], [701, 433], [1920, 1080]];
      let centred = true; const seen = [];
      for (const [w, hh] of sizes) {
        size(w, hh);
        await frame(); await frame();
        const v = Board.view(), a = mid(v, vpEl.clientWidth, vpEl.clientHeight), b = mid(big, W, H);
        seen.push([vpEl.clientWidth, vpEl.clientHeight, v.z, a.map((n) => +n.toFixed(3)), mid(big, W, H).map((n) => +n.toFixed(3))]);
        if (vpEl.clientWidth !== w || vpEl.clientHeight !== hh) centred = false; // the viewport really changed size
        if (Math.abs(a[0] - b[0]) > 1e-6 || Math.abs(a[1] - b[1]) > 1e-6 || v.z !== big.z) centred = false;
      }
      ok('other screen sizes keep the same board point in the middle at the same zoom', centred, JSON.stringify(seen));
      unsize();
      await frame(); await frame();
      const back = Board.view();
      ok('back on the first screen the view is exactly the same', back.x === big.x && back.y === big.y && back.z === big.z, JSON.stringify([big, back]));
      ok('screen changes never move notes or touch the vault', JSON.stringify(Board.current().items.map((m) => [m.note, m.x, m.y, m.w, m.h])) === notesBefore && Store.S.rev === rev);
      // reopening the board on a different screen centres the same point too
      const id = Board.current().id;
      size(900, 600); await frame(); await frame();
      Board.unmount(); Board.mount(Store.board(id)); await frame();
      const re = mid(Board.view(), vpEl.clientWidth, vpEl.clientHeight), was = mid(big, W, H);
      ok('a board reopened on another screen size centres the same point', Math.abs(re[0] - was[0]) < 1e-6 && Math.abs(re[1] - was[1]) < 1e-6);
      unsize(); await frame(); await frame();
      // arrange depends only on the notes, not on the window
      const layout = () => JSON.stringify(Board.current().items.map((m) => [m.x, m.y]));
      Board.arrange(); const wide = layout();
      size(640, 480); await frame(); await frame();
      Board.arrange(); const narrow = layout();
      unsize(); await frame(); await frame();
      ok('arrange gives the same layout on any screen size', wide === narrow);
    }

    // several notes at once: shift-click, a shift-drag box, moving and acting on all of them
    {
      const mod = { metaKey: isMac, ctrlKey: !isMac };
      const g1 = Board.addNote({ x: 3000, y: 3000 }, false, '<p>Group one</p>');
      const g2 = Board.addNote({ x: 3300, y: 3000 }, false, '<p>Group two</p>');
      const g3 = Board.addNote({ x: 3600, y: 3000 }, false, '<p>Group three</p>');
      await wait(30);
      const el = (n) => $(`.note[data-id="${n.id}"]`);
      const ptr = (type, target, o = {}) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...o }));
      Board.select(g1.id);
      ptr('pointerdown', el(g2).querySelector('.note-body'), { shiftKey: true });
      ok('shift-click adds a note to the selection', Board.selection().length === 2 && el(g1).classList.contains('sel') && el(g2).classList.contains('sel'), Board.selection().length);
      ptr('pointerdown', el(g2).querySelector('.note-body'), { shiftKey: true });
      ok('shift-click again takes it out', Board.selection().length === 1 && !el(g2).classList.contains('sel'));
      Board.select(null);
      const r1 = el(g1).getBoundingClientRect(), r3 = el(g3).getBoundingClientRect();
      ptr('pointerdown', $('.board-vp'), { shiftKey: true, clientX: r1.left - 10, clientY: r1.top - 10 });
      ptr('pointermove', window, { clientX: r3.right + 10, clientY: r3.bottom + 10 });
      ok('a shift-drag box shows while drawing', !!$('.marquee'));
      ptr('pointerup', window, { clientX: r3.right + 10, clientY: r3.bottom + 10 });
      const sel3 = Board.selection();
      ok('the box selects every note it touches', sel3.length === 3 && [g1, g2, g3].every((n) => sel3.includes(n.id)) && !$('.marquee'), JSON.stringify(sel3));
      const its = [g1, g2, g3].map((n) => Board.item(n.id)), xs = its.map((m) => m.x), ys = its.map((m) => m.y);
      const b1 = el(g1).querySelector('.note-body').getBoundingClientRect();
      ptr('pointerdown', el(g1).querySelector('.note-body'), { clientX: b1.left + 20, clientY: b1.top + 20 });
      ptr('pointermove', window, { clientX: b1.left + 20 + 96 * Board.zoom(), clientY: b1.top + 20 + 48 * Board.zoom() });
      ptr('pointerup', window, { clientX: b1.left + 20 + 96 * Board.zoom(), clientY: b1.top + 20 + 48 * Board.zoom() });
      ok('dragging one selected note moves them all', its.every((m, i) => m.x - xs[i] === 96 && m.y - ys[i] === 48) && Board.selection().length === 3, JSON.stringify(its.map((m, i) => [m.x - xs[i], m.y - ys[i]])));
      keydown(document.body, 'ArrowRight');
      ok('arrows nudge every selected note', its.every((m, i) => m.x - xs[i] === 104));
      keydown(document.body, '3');
      {
        // nine adaptive colours: each a light and a dark pair, all readable, unknown names shown as moth
        const probe = document.createElement('div'); $('.plane').append(probe);
        const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
        const L = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const look = (theme, c) => { document.documentElement.dataset.theme = theme; probe.className = 'note paper-' + c; const cs = getComputedStyle(probe); return [cs.backgroundColor, cs.color]; };
        const was = document.documentElement.dataset.theme, rows = [];
        for (const c of Board.COLORS) rows.push([c, look('night', c), look('day', c)]);
        const fallback = look('day', 'some-future-colour')[0] === look('day', 'moth')[0] && look('night', 'some-future-colour')[0] === look('night', 'moth')[0];
        document.documentElement.dataset.theme = was; probe.remove();
        ok('nine note colours, keys 1 to 9', Board.COLORS.length === 9);
        ok('every colour switches between a light and a dark paper', rows.every(([c, n, d]) => c === 'night' ? true : L(d[0]) > 0.6 && L(n[0]) < 0.08), JSON.stringify(rows.map(([c, n, d]) => [c, n[0], d[0]])));
        ok('every colour is distinct in both themes', new Set(rows.map((r) => r[1][0])).size === 9 && new Set(rows.map((r) => r[2][0])).size === 9);
        ok('text on every paper is very readable (AAA, 7:1 or more) in both themes', rows.every(([, n, d]) => ratio(...n) >= 7 && ratio(...d) >= 7), JSON.stringify(rows.map(([c, n, d]) => [c, ratio(...n).toFixed(1), ratio(...d).toFixed(1)])));
        ok('a colour from a newer release is shown as moth', fallback);
      }
      ok('a colour key colours every selected note', [g1, g2, g3].every((n) => n.color === 'apricot' && el(n).classList.contains('paper-apricot')));
      const onBoard = Board.current().items.length;
      keydown(document.body, 'Delete');
      ok('Del asks once for the whole selection', Board.current().items.length === onBoard && $$('.note.arming').length === 3 && /Remove 3\?/.test($('.note-x.armed').textContent), $$('.note.arming').length);
      keydown(document.body, 'Delete');
      ok('a second Del removes them all from the board', Board.current().items.length === onBoard - 3 && [g1, g2, g3].every((n) => !!Store.noteRef(n.id)));
      keydown(document.body, 'z', mod);
      ok('one undo puts them all back, still selected', Board.current().items.length === onBoard && Board.selection().length === 3 && [g1, g2, g3].every((n) => !!el(n)));
      ptr('pointerdown', el(g2).querySelector('.note-body'));
      ptr('pointerup', window);
      ok('a plain click on one of them selects just that one', Board.selection().length === 1 && Board.selected() === g2.id);
      keydown(document.body, 'a', mod);
      ok(`${kb('mod+a')} selects every note on the board`, Board.selection().length === Board.current().items.length);
      Board.select(g1.id);
      ptr('pointerdown', el(g3).querySelector('.note-body'), { shiftKey: true });
      keydown(document.body, 'Delete', { shiftKey: true });
      ok('shift+Del asks before deleting all of them everywhere', !!$('.modal') && /Delete 2 notes everywhere/.test($('.modal').textContent));
      $('.modal .btn.primary').click();
      await wait(30);
      ok('they are deleted everywhere', !Store.noteRef(g1.id) && !Store.noteRef(g3.id) && !!Store.noteRef(g2.id));
      keydown(document.body, 'z', mod);
      ok('undo restores both', !!Store.noteRef(g1.id) && !!Store.noteRef(g3.id) && !!el(g1) && !!el(g3));
      for (const n of [g1, g2, g3]) Board.removeEverywhere(n.id, true);
      Board.select(null);
    }

    // tables
    {
      const mod = { metaKey: isMac, ctrlKey: !isMac };
      const nt = Board.addNote({ x: 40, y: 1400 }, false, '<p>Ports</p><p><br></p>');
      await wait(30);
      Board.focusBody(nt.id);
      const tb = $(`.note[data-id="${nt.id}"] .note-body`);
      await type('/');
      await type('table 3x2');
      keydown(tb, 'Enter');
      const tbl = tb.querySelector('table');
      ok('/table 3x2 inserts a table with a header row', !!tbl && tbl.rows.length === 3 && tbl.rows[0].cells.length === 3 && tbl.rows[0].cells[0].tagName === 'TH', tb.innerHTML);
      if (tbl) {
        await type('service');
        keydown(tb, 'Tab'); await type('port');
        keydown(tb, 'Tab'); await type('notes');
        keydown(tb, 'Tab'); await type('api');
        ok('Tab moves to the next cell', tbl.rows[0].cells[1].textContent === 'port' && tbl.rows[1].cells[0].textContent === 'api', tbl.innerHTML);
        keydown(tb, 'Enter'); await type('db');
        ok('Enter moves to the cell below', tbl.rows[2].cells[0].textContent === 'db');
        keydown(tb, 'Enter');
        ok('Enter in the last row adds a row', tbl.rows.length === 4);
        for (let i = 0; i < 3; i++) keydown(tb, 'Tab');
        keydown(tb, 'Tab');
        ok('Tab past the last cell adds a row', tbl.rows.length === 5);
        await type('/');
        ok('the / menu offers table actions inside a table', Popup.isOpen() && /Add column right/.test($('.pop').textContent));
        await type('delete row');
        keydown(tb, 'Enter');
        ok('a table action from the / menu works', tbl.rows.length === 4, tbl.rows.length);
        keydown(tb, 'Enter', mod);
        await type('after');
        ok(`${kb('mod+enter')} leaves the table`, tbl.nextElementSibling && tbl.nextElementSibling.textContent === 'after');
        tb.blur(); await wait(400);
        ok('a table is saved and searchable', /<table>/.test(nt.html) && /service {2}port {2}notes/.test(nt.text) && /api/.test(nt.text), nt.text);
      }
      const pasted = Editor.sanitize('<table style="color:red"><tr><td onclick="x()">a</td><td>b</td></tr><tr><td>c</td></tr><script>bad()</script></table>');
      const box = document.createElement('div'); box.append(pasted);
      ok('pasted tables keep rows and cells only, padded to the same width', !/style|onclick|script/.test(box.innerHTML) && box.querySelectorAll('tr').length === 2 && box.querySelectorAll('tr')[1].cells.length === 2, box.innerHTML);
      Board.removeEverywhere(nt.id, true);
    }

    // find on the board
    {
      const f1 = Board.addNote({ x: 40, y: 2000 }, false, '<p>Runbook</p><p>restart the kafka broker</p><p>then check kafka lag</p>');
      const f2 = Board.addNote({ x: 400, y: 2000 }, false, '<p>Other</p><p>nothing here</p>');
      const f3 = Board.addNote({ x: 760, y: 2000 }, false, '<p>Infra</p><pre class="code"><code>kafka-topics --list</code></pre>');
      await wait(30);
      Board.select(null); // find starts from the selected note, like a browser's find starts from the caret
      keydown(document.body, 'f', { metaKey: isMac, ctrlKey: !isMac });
      ok(`${kb('mod+f')} opens the find bar`, !!$('.find-bar') && document.activeElement === $('.find-input'));
      $('.find-input').value = 'KAFKA';
      $('.find-input').dispatchEvent(new Event('input'));
      await wait(30);
      ok('find counts every match in every note', /of 3 in 2 notes/.test($('.find-count').textContent), $('.find-count').textContent);
      ok('notes without a match fade back', $('.board-vp').classList.contains('finding') && $(`.note[data-id="${f1.id}"]`).classList.contains('found') && !$(`.note[data-id="${f2.id}"]`).classList.contains('found'));
      ok('matches are painted without touching the note', !('highlights' in CSS) || CSS.highlights.get('fm-find').size === 3);
      ok('the note text itself is unchanged', !/mark/.test($(`.note[data-id="${f1.id}"] .note-body`).innerHTML));
      keydown($('.find-input'), 'Enter'); keydown($('.find-input'), 'Enter');
      ok('Enter steps to the next match, in the next note', /^3 of 3/.test($('.find-count').textContent) && Board.selected() === f3.id, $('.find-count').textContent + ' ' + Board.selected());
      keydown($('.find-input'), 'Enter', { shiftKey: true });
      ok('Shift+Enter steps back', /^2 of 3/.test($('.find-count').textContent) && Board.selected() === f1.id);
      $('.find-input').value = 'zzzz'; $('.find-input').dispatchEvent(new Event('input'));
      ok('no match says so', $('.find-count').textContent === 'No matches' && $('.find-bar').classList.contains('none'));
      keydown($('.find-input'), 'Escape');
      ok('Esc closes find and clears it', !$('.find-bar') && !$('.board-vp').classList.contains('finding') && !$$('.note.found').length);
      // search opens the note at its match
      const hit = Palette.search('broker').find((x) => x.id === f1.id);
      ok('search remembers which word matched in the text', hit && hit.hit === 'broker', JSON.stringify(hit));
      Palette.show('broker'); await wait(20);
      keydown($('.pal-input'), 'Enter');
      await wait(120);
      ok('opening a text match from search finds it in the note', !!$('.find-bar') && $('.find-input').value === 'broker' && Board.selected() === f1.id, $('.find-bar') && $('.find-input').value);
      keydown($('.find-input'), 'Escape');
      for (const n of [f1, f2, f3]) Board.removeEverywhere(n.id, true);
      const back = Store.S.data.ui.active;
      App.openTab('notes'); await wait(20);
      keydown(document.body, 'f', { metaKey: isMac, ctrlKey: !isMac });
      ok(`${kb('mod+f')} on All notes jumps to its filter`, document.activeElement && document.activeElement.matches('.notes-page .s-filter'));
      document.activeElement.blur();
      App.openTab(back); await wait(20);
    }

    // search with nothing typed: what you edited last
    {
      const recent = Palette.search('');
      ok('empty search lists recently edited notes, newest first, then boards', recent[0].group === 'Recently edited' && recent.some((x) => x.group === 'Boards') && recent.filter((x) => x.type === 'note').every((x, i, a) => !i || a[i - 1].upd >= x.upd), JSON.stringify(recent.slice(0, 3).map((x) => [x.group, x.title])));
      Palette.show(''); await wait(20);
      ok('search shows section headings', $$('.pal-group').length >= 2 && $$('.pal-group')[0].textContent === 'Recently edited' && /ago|just now/.test($('.pal-item .pal-sub').textContent), $$('.pal-group').map((x) => x.textContent).join());
      Palette.hide();
    }

    // palette search
    const hits = Palette.search('backoff');
    ok('palette finds note by title', hits[0] && hits[0].title === 'Retry with backoff', JSON.stringify(hits.slice(0, 2).map((x) => x.title)));
    const body2 = Palette.search('sleep');
    ok('palette finds note by body', body2.some((x) => x.title === 'Retry with backoff'), JSON.stringify(body2.map((x) => x.title)));
    ok('palette never searches secret values', Palette.search('$s3cr3t').length === 0);
    ok('palette commands', Palette.search('>arrange').some((x) => x.title === 'Arrange notes'));

    ok('the default accent is the calm green', document.documentElement.dataset.accent === 'green' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#7fae86');
    ok('the bird has sage eyes', getComputedStyle($('.hud-bird .fm-iris')).fill === 'rgb(141, 180, 154)', getComputedStyle($('.hud-bird .fm-iris')).fill);

    // the bird falls asleep (eyes shut, breathing, drifting z's) and wakes on any key or move
    {
      const mark = $('.hud-bird .fm');
      await wait(700); // let the search box's own "rest" timer from earlier tests run out
      Bird.mood('asleep'); await wait(400);
      const lidY = (svg) => parseFloat(svg.querySelector('.fm-lidg').style.transform.match(/translateY\(([-\d.]+)px\)/)[1]);
      ok('asleep: the bird gets the asleep look', mark.classList.contains('asleep') && $$('.fm.asleep').length >= 2);
      ok('asleep: eyes are shut', lidY(mark) > 0, mark.querySelector('.fm-lidg').style.transform);
      ok('asleep: three z\'s drift up, one after another', mark.querySelectorAll('.fm-z').length === 3 && mark.querySelectorAll('.fm-z')[0].getAnimations().length === 1 && new Set([...mark.querySelectorAll('.fm-z')].map((z) => z.style.animationDelay)).size === 3);
      ok('asleep: the head breathes', mark.querySelector('.fm-head').getAnimations().length === 1);
      ok('the wordmark sleeps too, without z\'s', $('.hud-logo .fm').classList.contains('asleep') && !$('.hud-logo .fm .fm-z'));
      keydown(document.body, 'Shift');
      await wait(600); // it wakes with a double blink (and may blink again at random: wait for open eyes)
      for (let i = 0; i < 20 && lidY(mark) >= 0; i++) await wait(100);
      ok('a key wakes it: z\'s gone, eyes open', !mark.classList.contains('asleep') && !mark.querySelector('.fm-z').getAnimations().length && lidY(mark) < 0, mark.querySelector('.fm-lidg').style.transform);
    }

    // secrets
    App.openTab('secrets');
    await wait(50);
    Secrets.setFilter('env:prod');
    ok('kv tag filter', $$('.srow').length === 2, $$('.srow').length);
    Secrets.setFilter('aws -env:prod');
    ok('negated filter', $$('.srow').length === 0);
    Secrets.setFilter('');
    ok('values masked', !$('.s-list').textContent.includes('s3cr3t'));
    Secrets.edit(null);
    await wait(220); // let the open animation finish
    {
      const r = $('.s-drawer').getBoundingClientRect();
      ok('secret editor opens centred', Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2, JSON.stringify([r.left, r.top, r.width, r.height, innerWidth, innerHeight]));
      $('.secrets').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      ok('clicking outside closes the editor', $('.s-drawer').hidden);
    }
    ok('tag row is a pivot: plain tags, then each key with its values', $$('.secrets .s-tagrow > .chip').map((c) => c.dataset.tag).join() === 'aws,billing,db,example' && $$('.secrets .tp-group .tp-k').length === 1 && $$('.secrets .tp-group .tp-v').map((c) => c.dataset.tag).join() === 'env:dev,env:prod,env:staging', $$('.secrets .s-tagrow .chip').map((c) => c.dataset.tag).join());
    {
      // tags: AND with spaces, OR with commas, any value with key:, deeper levels by prefix
      const T = (tags, q) => Tags.match(tags, Tags.tokens(q));
      ok('commas mean either', T(['env:staging'], 'env:prod,staging') && !T(['env:dev'], 'env:prod,staging') && T(['db'], 'api,db'));
      ok('spaces mean both', T(['aws', 'env:prod'], 'aws env:prod') && !T(['aws'], 'aws env:prod'));
      ok('a key alone means any value', T(['env:dev'], 'env:') && !T(['aws'], 'env:'));
      ok('deeper levels are found from their parent', T(['team:platform/infra'], 'team:platform') && !T(['team:web'], 'team:platform'));
      ok('negation and alternatives together', !T(['env:prod'], '-env:prod,dev') && T(['env:staging'], '-env:prod,dev'));
      ok('shift-click adds an alternative and removes it again', Tags.orToggle('aws env:prod ', 'env:staging') === 'aws env:prod,staging ' && Tags.orToggle('env:prod,staging ', 'env:prod') === 'env:staging ');
      const sf = $('.secrets .s-filter');
      Secrets.setFilter('env:prod');
      const cnt = (t) => { const c = $(`.secrets .s-tagrow .chip[data-tag="${t}"]`); return [+c.querySelector('i').textContent, c.classList.contains('zero'), c.classList.contains('on')]; };
      ok('counts follow the results: what a click would leave', JSON.stringify([cnt('env:prod'), cnt('env:dev'), cnt('aws')]) === JSON.stringify([[2, false, true], [0, true, false], [2, false, false]]), JSON.stringify([cnt('env:prod'), cnt('env:dev'), cnt('aws')]));
      $('.secrets .tp-k').click();
      ok('clicking a key filters any of its values', sf.value.trim() === 'env:prod env:');
      Secrets.setFilter('env:prod ');
      $('.secrets .s-tagrow .chip[data-tag="env:staging"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      ok('shift-click on a chip ORs it in', sf.value.trim() === 'env:prod,staging' && $$('.srow').length === 3, sf.value + ' ' + $$('.srow').length);
      // autocomplete
      Secrets.setFilter(''); sf.focus();
      const typeIn = (txt) => { sf.value += txt; sf.setSelectionRange(sf.value.length, sf.value.length); sf.dispatchEvent(new Event('input', { bubbles: true })); };
      typeIn('en');
      const pop = () => ($('.pop') ? [...$$('.pop .pop-label')].map((x) => x.textContent) : []);
      ok('typing suggests tags, the key first', Popup.isOpen() && pop()[0] === 'envany', JSON.stringify(pop()));
      keydown(sf, 'Tab');
      ok('Tab completes the key and goes on to its values', sf.value === 'env:' && Popup.isOpen() && pop().length === 3, sf.value + ' ' + JSON.stringify(pop()));
      keydown(sf, 'ArrowDown'); keydown(sf, 'Enter');
      ok('Enter picks a value', /^env:(dev|prod|staging) $/.test(sf.value) && !Popup.isOpen(), JSON.stringify(sf.value));
      Secrets.setFilter(''); sf.focus(); typeIn('env:prod,st');
      ok('after a comma it offers the key\'s other values', Popup.isOpen() && JSON.stringify(pop()) === '["envstaging"]', JSON.stringify(pop()));
      keydown(sf, 'Tab');
      ok('and completes them', sf.value === 'env:prod,staging ', JSON.stringify(sf.value));
      typeIn('b');
      keydown(sf, 'Escape');
      ok('Esc closes the suggestions and keeps the filter', !Popup.isOpen() && sf.value === 'env:prod,staging b');
      Secrets.setFilter(''); sf.blur();
      // search understands tag tokens exactly
      const hits = Palette.search('$env:prod,staging').map((x) => x.title).sort();
      ok('search filters by tags exactly, with alternatives', JSON.stringify(hits) === JSON.stringify(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL']), JSON.stringify(hits));
      ok('search: tags and text together', JSON.stringify(Palette.search('$env:prod secret').map((x) => x.title)) === JSON.stringify(['AWS_SECRET_ACCESS_KEY']), JSON.stringify(Palette.search('$env:prod secret').map((x) => x.title)));
    }
    ok('switcher shows secrets active', $('.hud-switch [data-view="secrets"]').classList.contains('on'));
    $('.hud-switch [data-view="board"]').click();
    ok('switcher returns to the board', !$('.board-vp').hidden && $('.secrets').hidden);
    ok('memory vault shows no-file sync icon', $('.hud-sync').classList.contains('sync-none'));
    App.openTab('secrets');

    // board pills: + adds a board and renames it in place, click switches, x deletes (undoable)
    App.openTab('b:' + Store.S.data.boards[0].id);
    const nBoards = Store.S.data.boards.length;
    $('.bp-add').click();
    const inp = $('.bp-input');
    ok('+ creates a board with an inline name field', Store.S.data.boards.length === nBoards + 1 && !!inp);
    if (inp) { inp.value = 'Infra'; keydown(inp, 'Enter'); }
    const infra = Store.S.data.boards.find((b) => b.name === 'Infra');
    ok('inline rename saves', !!infra && $$('.board-pill .bp-name').some((e) => e.textContent === 'Infra'));
    ok('new board is active', Store.S.data.ui.active === 'b:' + infra.id && $('.board-pill.on .bp-name').textContent === 'Infra');
    $$('.board-pill')[0].click();
    ok('clicking a pill switches board', Store.S.data.ui.active === 'b:' + Store.S.data.boards[0].id);
    $(`.board-pill[data-id="${infra.id}"] .bp-x`).click();
    ok('x deletes an empty board', !Store.board(infra.id) && $$('.board-pill').length === nBoards);
    keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
    ok('undo restores the board', !!Store.board(infra.id));
    App.openTab('secrets');

    // note tags (same system as secrets) and the all-notes page
    App.openTab('b:' + Store.S.data.boards[0].id);
    await wait(250);
    const retryRef = [...Store.S.notes.values()].find(({ note }) => note.title === 'Retry with backoff');
    ok('starter note carries tags', retryRef && retryRef.note.tags.includes('lang:js'));
    ok('note foot shows tag chips', $$(`.note[data-id="${retryRef.note.id}"] .note-foot .chip`).length === 2);
    Board.select(retryRef.note.id);
    keydown(document.body, 't');
    const ti = $(`.note[data-id="${retryRef.note.id}"] .tag-input`);
    ok('t opens the tag editor', !!ti);
    if (ti) {
      ti.value += 'env:pr';
      ti.dispatchEvent(new Event('input'));
      ok('tag editor suggests existing tags', Popup.isOpen() && $$('.pop .pop-item').some((x) => x.textContent.includes('prod')));
      keydown(ti, 'Enter');
      ok('completion inserts the tag', ti.value.endsWith('env:prod '), ti.value);
      ti.value += 'retry';
      keydown(ti, 'Enter');
    }
    ok('tags saved on the note', ['snippet', 'lang:js', 'env:prod', 'retry'].every((t) => retryRef.note.tags.includes(t)), JSON.stringify(retryRef.note.tags));
    $('.hud-switch [data-view="notes"]').click();
    await wait(30);
    ok('notes page lists every note', $$('.nrow').length === Store.S.notes.size, $$('.nrow').length + ' vs ' + Store.S.notes.size);
    {
      const hudBottom = Math.max(...$$('.hud-pill').map((p) => p.getBoundingClientRect().bottom));
      const filterTop = $('.notes-page .s-filter').getBoundingClientRect().top;
      ok('the page filter sits clear of the floating bar', filterTop - hudBottom >= 20, [hudBottom, filterTop]);
    }
    NotesList.setFilter('env:prod');
    ok('notes page filters by kv tag', $$('.nrow').length === 1 && $('.nrow .n-title b').textContent === 'Retry with backoff');
    NotesList.setFilter('-lang:js');
    ok('negated tag filter', !$$('.nrow .n-title b').some((b) => b.textContent === 'Retry with backoff'));
    NotesList.setFilter('');
    $('.n-head [data-sort="title"]').click();
    const titles = $$('.nrow .n-title b').map((b) => b.textContent);
    ok('sort by title', titles.join() === [...titles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(), titles.join());
    $('.n-head [data-sort="title"]').click();
    ok('sort flips', $$('.nrow .n-title b')[0].textContent === titles[titles.length - 1]);
    const welcomeRow = $$('.nrow').find((r) => r.querySelector('.n-title b').textContent === 'Welcome to frogmouth');
    ok('backlink count shown', welcomeRow && /← [1-9]/.test(welcomeRow.querySelector('.n-links').textContent));
    welcomeRow.querySelector('.n-title').click();
    await wait(50);
    ok('clicking a row opens the note on its board', Store.S.data.ui.active.startsWith('b:') && Board.selected() === welcomeRow.dataset.id);
    ok('palette finds notes by tag', Palette.search('retry').some((x) => x.title === 'Retry with backoff' && x.type === 'note'));
    App.openTab('secrets');

    // folder label on the sync pill, and the secrets JSON export
    ok('sync pill says no folder in memory mode', $('.sync-where').textContent === 'No folder');
    {
      let grabbed = null, blob = null;
      const realClick = HTMLAnchorElement.prototype.click, realURL = URL.createObjectURL;
      URL.createObjectURL = (b) => { blob = b; return realURL.call(URL, b); };
      HTMLAnchorElement.prototype.click = function () { if (this.download) grabbed = { name: this.download, href: this.href }; else realClick.call(this); };
      const pending = Secrets.exportJson();
      await wait(20);
      const primary = $('.modal .btn.primary');
      ok('export asks before writing plaintext', !!primary && /plain text/.test($('.modal').textContent));
      primary.click();
      await pending; await wait(20);
      HTMLAnchorElement.prototype.click = realClick; URL.createObjectURL = realURL;
      ok('export downloads a dated json file', grabbed && /^frogmouth-secrets-\d{4}-\d{2}-\d{2}\.json$/.test(grabbed.name), grabbed && grabbed.name);
      if (grabbed) {
        const j = JSON.parse(await blob.text()); // fetch() is blocked by the page's CSP, as it should be
        ok('export holds every secret and no notes', j.kind === 'secrets' && j.secrets.length === Store.S.data.secrets.length && !('boards' in j) && !JSON.stringify(j).includes('Retry with backoff'));
        const db = j.secrets.find((x) => x.key === 'DATABASE_URL');
        ok('export keeps values and tags', db && db.value === 'postgres://app:pw@db:5432/app' && db.tags.includes('env:staging'), JSON.stringify(db));
      }
    }

    // menus close on a click on the board (the board cancels pointerdown, which used to swallow it)
    App.openTab('b:' + Store.S.data.boards[0].id);
    await wait(250);
    const footWithLinks = $$('.note-foot').find((f) => f.querySelector('.backlinks'));
    footWithLinks.querySelector('.backlinks').click();
    ok('linked-from menu opens', Popup.isOpen());
    $('.board-vp').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    ok('clicking the board closes it', !Popup.isOpen());

    ok('no stray "null" in the board pills', !/null|undefined/.test($('.hud-boards').textContent), $('.hud-boards').textContent);
    ok('the boards button is always there', !!$('.bp-more'));
    {
      window.__errs = [];
      const onErr = (e) => window.__errs.push(String(e.error || e.reason || e.message));
      addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, code: 'Slash', bubbles: true, cancelable: true }));
      await wait(30);
      ok('? opens the keyboard shortcuts', !!$('.modal.keys') && $$('.keys-grid section').length >= 4, JSON.stringify(window.__errs) + ' modal:' + !!$('.modal'));
      ok('the shortcuts list shows keys and descriptions, not object text', $$('.keys-grid dt kbd').length > 30 && $$('.keys-grid dd').length === $$('.keys-grid dt').length && !/\[object/.test($('.keys-grid').textContent), $('.keys-grid').textContent.slice(0, 120));
      if ($('.modal')) keydown($('.modal'), 'Escape');
      await wait(20);
      $('.hud-menu').click();
      const keysItem = $$('.pop-item').find((x) => /Keyboard shortcuts/.test(x.textContent));
      keysItem && keysItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await wait(30);
      ok('the menu opens the keyboard shortcuts', !!$('.modal.keys'), JSON.stringify(window.__errs));
      if ($('.modal')) keydown($('.modal'), 'Escape');
      removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
    }
    for (const v of ['b:' + Store.S.data.boards[0].id, 'notes', 'secrets']) {
      App.openTab(v); await wait(30);
      ok(`no "[object …]" text in the ${v.startsWith('b:') ? 'board' : v} view`, !/\[object /.test(document.body.innerText));
    }

    // many boards: only recent ones get pills; the rest are one search away
    {
      const d = Store.S.data, before = d.boards.length;
      for (let i = 1; i <= 30; i++) d.boards.push({ id: uid(), name: `Project ${i}`, created: now(), items: [] });
      Store.change('boards');
      ok('at most 6 board pills', $$('.board-pill').length <= 6, $$('.board-pill').length);
      ok('the boards button shows the count', $('.bp-more').textContent.includes(String(before + 30)));
      keydown(document.body, 'j', { altKey: true, code: 'KeyJ' });
      ok('alt+J opens the boards panel', !!$('.bd-panel') && $$('.bd-row').length === before + 30);
      const bin = $('.bd-input');
      bin.value = 'proj 17'; bin.dispatchEvent(new Event('input'));
      ok('the panel filters by name', $$('.bd-row')[0] && $$('.bd-row')[0].textContent.includes('Project 17'));
      keydown(bin, 'Enter');
      const p17 = d.boards.find((b) => b.name === 'Project 17');
      ok('opening a board from the panel gives it a pill', !$('.bd-panel') && d.ui.active === 'b:' + p17.id && $$('.board-pill .bp-name').some((e) => e.textContent === 'Project 17'));
      // pin a board that has no pill: it gets one and keeps it
      keydown(document.body, 'j', { altKey: true, code: 'KeyJ' });
      const bin2 = $('.bd-input');
      bin2.value = 'Project 3'; bin2.dispatchEvent(new Event('input'));
      keydown(bin2, 'p', { altKey: true, code: 'KeyP' });
      const p3 = d.boards.find((b) => b.name === 'Project 3');
      ok('alt+P pins a board', p3.pinned === true && !!$('.bd-row .bd-pin.pinned'));
      keydown(bin2, 'Escape');
      ok('Esc closes the panel', !$('.bd-panel'));
      for (let k = 20; k <= 26; k++) App.openTab('b:' + d.boards.find((b) => b.name === `Project ${k}`).id); // use lots of other boards
      ok('a pinned board keeps its pill', $$('.board-pill .bp-name').some((e) => e.textContent === 'Project 3'));
      // rename and delete from the panel
      $('.bp-more').click();
      const bin3 = $('.bd-input');
      bin3.value = 'Project 4'; bin3.dispatchEvent(new Event('input'));
      keydown(bin3, 'F2');
      const ri = $('.bd-rename');
      ok('F2 renames inline', !!ri);
      ri.value = 'Renamed four'; keydown(ri, 'Enter');
      ok('rename saves', d.boards.some((b) => b.name === 'Renamed four'));
      bin3.value = 'Renamed four'; bin3.dispatchEvent(new Event('input'));
      keydown(bin3, 'Backspace', { metaKey: isMac, ctrlKey: !isMac, shiftKey: true });
      await wait(20);
      ok('delete from the panel removes an empty board', !d.boards.some((b) => b.name === 'Renamed four'));
      bin3.value = 'Brand new space'; bin3.dispatchEvent(new Event('input'));
      keydown(bin3, 'Enter');
      ok('typing a new name creates the board', d.boards.some((b) => b.name === 'Brand new space') && d.ui.active === 'b:' + d.boards.find((b) => b.name === 'Brand new space').id);
      d.boards.splice(before); Store.index(); App.openTab('b:' + d.boards[0].id);
    }
    App.openTab('secrets');

    // serialization round trip
    const text = await Store.serialize();
    const parsed = JSON.parse(text);
    ok('file format', parsed.frogmouth === Store.FORMAT && Store.FORMAT === 1 && !('version' in parsed.data) && Array.isArray(parsed.data.notes) && parsed.data.boards.length === 2 && parsed.data.boards.every((b) => Array.isArray(b.items) && !b.notes) && parsed.data.secrets.length === 5);
    const re = Store.normalize(JSON.parse(JSON.stringify(parsed.data)));
    ok('normalize round trip', re.boards[0].items.length === Store.S.data.boards[0].items.length && re.notes.length === Store.S.data.notes.length);
    {
      // fields a later release adds survive this release reading and saving the file
      const fut = Store.normalize({ later: { a: 1 }, notes: [{ id: 'n', html: '<p>a</p>', later: 1 }], boards: [{ id: 'b', name: 'B', later: 2, items: [{ note: 'n', x: 1, y: 2, w: 300, later: 3 }] }], secrets: [{ id: 's', key: 'K', value: 'v', later: 4 }], ui: { later: 5 } });
      const back = JSON.parse(JSON.stringify(fut));
      ok('unknown fields from a newer release are kept when saving', back.later.a === 1 && back.notes[0].later === 1 && back.boards[0].later === 2 && back.boards[0].items[0].later === 3 && back.secrets[0].later === 4 && back.ui.later === 5);
      const err = (text) => { try { Store.parse(text, 'x.fm'); return ''; } catch (e) { return e.message; } };
      ok('a file from a newer frogmouth is refused, with what to do', /newer frogmouth \(format 2\).*latest frogmouth\.html.*Nothing was changed/.test(err(JSON.stringify({ frogmouth: 2, data: {} }))));
      ok('JSON that is not a vault is refused', /not a frogmouth vault/.test(err(JSON.stringify([{ key: 'A', value: 'b' }]))) && /not a frogmouth vault/.test(err(JSON.stringify({ notes: [], boards: [] }))) && /not valid JSON/.test(err('{oops')));
      ok('a version 1 vault is read', err(Store.serialize()) === '' && Array.isArray(Store.parse(Store.serialize()).notes));
    }

    // notes are shared: one note on several boards; deleting a board keeps its notes
    {
      const d = Store.S.data;
      const welcome = [...Store.S.notes.values()].find(({ note }) => note.title === 'Welcome to frogmouth').note;
      const total = d.notes.length;
      const side = { id: uid(), name: 'Side', created: now(), items: [] };
      d.boards.push(side); Store.change('boards');
      App.openTab('b:' + side.id);
      Board.placeExisting(welcome.id);
      await wait(300);
      ok('a note can be placed on a second board', Store.noteRef(welcome.id).boards.length === 2 && !!$(`.note[data-id="${welcome.id}"]`));
      ok('shared note shows where else it lives', /2 boards/.test($(`.note[data-id="${welcome.id}"] .note-foot`).textContent));
      ok('placements keep their own geometry', Board.item(welcome.id) !== d.boards[0].items.find((it) => it.note === welcome.id));
      Board.addNote({ x: 600, y: 300 }, false, '<p>Only on Side</p>');
      const onlySide = [...Store.S.notes.values()].find(({ note }) => note.title === 'Only on Side').note;
      // delete the board through the pill (confirm modal, since it has notes)
      $(`.board-pill[data-id="${side.id}"] .bp-x`).click();
      await wait(30);
      const confirmBtn = $('.modal .btn.primary');
      ok('deleting a board says its notes stay', !!confirmBtn && /stay in All notes/.test($('.modal').textContent));
      confirmBtn.click();
      await wait(60);
      ok('board is gone', !Store.board(side.id));
      ok('its notes are not deleted', d.notes.length === total + 1 && !!Store.noteRef(onlySide.id) && !!Store.noteRef(welcome.id));
      ok('a note only on that board is now on no board', Store.noteRef(onlySide.id).boards.length === 0 && Store.noteRef(welcome.id).boards.length === 1);
      App.openTab('notes');
      await wait(30);
      const orphanRow = $$('.nrow').find((r) => r.querySelector('.n-title b').textContent === 'Only on Side');
      ok('notes page shows notes on no board', orphanRow && /on no board/.test(orphanRow.textContent));
      App.gotoNote(onlySide.id);
      ok('opening a boardless note shows it in the note view, on the notes page', Store.S.data.ui.active === 'notes' && Peek.isOpen() && Peek.current() === onlySide.id);
      Peek.close();
      // put it back on a board from the notes page
      App.addToBoard(onlySide.id);
      keydown(document.body, 'Enter'); // menus without a text field still take the keyboard
      await wait(60);
      ok('add to board from the notes page', Store.noteRef(onlySide.id).boards.length === 1 && Store.S.data.ui.active === 'b:' + d.boards[0].id);
      // Del removes from this board only; shift+Del deletes everywhere
      Board.select(onlySide.id);
      keydown(document.body, 'Delete', { shiftKey: true });
      await wait(30);
      ok('shift+Del asks before deleting everywhere', !!$('.modal') && /everywhere/.test($('.modal').textContent) && !!Store.noteRef(onlySide.id));
      $('.modal .btn.primary').click();
      await wait(30);
      ok('shift+Del deletes the note everywhere', !Store.noteRef(onlySide.id) && d.notes.length === total);
      keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
      ok('undo restores a deleted note', !!Store.noteRef(onlySide.id) && Store.noteRef(onlySide.id).boards.length === 1);
      App.openTab('secrets');
    }

    // OPFS: real file writes through the File System Access API
    if (Store.canOPFS() && location.protocol.startsWith('http')) {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('fm-test-' + Date.now(), { create: true });
        const res = await Store.openDir(dir, 'opfs');
        ok('opfs creates vault', res.ok && res.fresh);
        App.enter();
        ok('sync pill names the storage', $('.sync-where').textContent === 'Browser storage');
        Store.S.data.secrets.push({ id: uid(), key: 'OPFS_KEY', value: 'v', tags: [], desc: '' });
        Store.change('secrets');
        await wait(900);
        const f = await (await dir.getFileHandle('vault.fm')).getFile();
        ok('opfs autosaves', (await f.text()).includes('OPFS_KEY') && Store.S.status === 'saved', Store.S.status);
        const ir = await Store.saveImage(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'x.png');
        ok('image saved to assets/', ir.path && ir.path.startsWith('assets/'));
        const fp = await Store.importFile(new File(['{"type":"excalidraw"}'], 'arch.excalidraw'));
        ok('file imported to files/', fp === 'files/arch.excalidraw', fp);
        const all = await Store.listFiles();
        ok('list files sees both', all.includes('files/arch.excalidraw') && all.some((p) => p.startsWith('assets/')), JSON.stringify(all));
        const plainOnDisk = JSON.parse(await (await (await dir.getFileHandle('vault.fm')).getFile()).text());
        ok('the vault is plain JSON', plainOnDisk.data.secrets.some((s) => s.key === 'OPFS_KEY'));

        // saving: an edit made while a write is in flight stays unsaved and gets its own write
        Store.S.data.secrets.push({ id: uid(), key: 'RACE_ONE', value: '1', tags: [], desc: '' }); Store.change('secrets');
        await wait(360); // the debounced save starts...
        Store.S.data.secrets.push({ id: uid(), key: 'RACE_TWO', value: '2', tags: [], desc: '' }); Store.change('secrets'); // ...and this lands mid-write
        ok('an edit during a save keeps the vault marked unsaved', Store.S.dirty === true);
        await wait(900);
        const raced = await (await (await dir.getFileHandle('vault.fm')).getFile()).text();
        ok('the later edit is written too', raced.includes('RACE_ONE') && raced.includes('RACE_TWO') && !Store.S.dirty && Store.S.status === 'saved', Store.S.status);

        // a change made elsewhere is never silently overwritten: the save stops and asks
        Store.S.vault.kind = 'dir'; // the folder-vault code path (OPFS handles speak the same API)
        await wait(30);
        const outside = JSON.stringify({ frogmouth: 1, data: { ...JSON.parse(JSON.stringify(Store.S.data)), secrets: [{ id: 'x', key: 'FROM_OUTSIDE', value: '1', tags: [] }] } });
        const xw2 = await (await dir.getFileHandle('vault.fm')).createWritable(); await xw2.write(outside); await xw2.close();
        Store.S.data.secrets.push({ id: uid(), key: 'MINE', value: '1', tags: [], desc: '' }); Store.change('secrets');
        await wait(600);
        const kept = await (await (await dir.getFileHandle('vault.fm')).getFile()).text();
        ok('a conflicting save does not overwrite the other version', Store.S.status === 'conflict' && kept.includes('FROM_OUTSIDE') && !kept.includes('"MINE"'), Store.S.status);
        await Store.keepMine();
        const mine = await (await (await dir.getFileHandle('vault.fm')).getFile()).text();
        ok('"Keep mine" then writes this version once', mine.includes('"MINE"') && Store.S.status === 'saved' && !Store.S.force, Store.S.status);
        Store.S.vault.kind = 'opfs';
        // a change made outside the app is reloaded and shown (the board must not keep stale notes)
        App.enter(); await wait(50);
        const disk = JSON.parse(JSON.stringify(Store.S.data));
        disk.notes.push({ id: 'ext1', html: '<p>Written by another window</p>', color: 'rose' });
        disk.boards[0].items.push({ note: 'ext1', x: 900, y: 40, w: 260 });
        const ew = await (await dir.getFileHandle('vault.fm')).createWritable(); await ew.write(JSON.stringify({ frogmouth: 1, data: disk })); await ew.close();
        await Store.reloadFrom(); await wait(80);
        ok('external changes re-render the board', !!$('.note[data-id="ext1"]') && Board.current() === Store.S.data.boards[0], $$('.note').length);
        // a vault saved by a newer frogmouth is never opened, so it can never be written over
        const nd = await root.getDirectoryHandle('fm-newer-' + Date.now(), { create: true });
        const newer = JSON.stringify({ frogmouth: 2, data: { shape: 'unknown to this version' } });
        const nw = await (await nd.getFileHandle('vault.fm', { create: true })).createWritable(); await nw.write(newer); await nw.close();
        const openBefore = Store.S.vault;
        let refusal = ''; try { await Store.openDir(nd, 'opfs'); } catch (e) { refusal = e.message; }
        ok('a newer vault is not opened and the open vault stays as it was', /newer frogmouth/.test(refusal) && Store.S.vault === openBefore, refusal);
        ok('the newer file is left byte for byte', (await (await (await nd.getFileHandle('vault.fm')).getFile()).text()) === newer);
        await root.removeEntry(nd.name, { recursive: true });
        // closing leaves nothing behind on the page
        App.openTab('secrets'); await wait(20);
        Store.close(); await wait(20);
        ok('closing clears notes and secrets from the page', !$$('.note').length && !$('.s-list').children.length && !Store.S.notes.size);
        await root.removeEntry(dir.name, { recursive: true });
      } catch (err) { ok('opfs flow', false, err && (err.stack || err.message)); }
    }
  } catch (err) {
    ok('no exceptions', false, err && (err.stack || err.message));
  }

  const failed = results.filter((r) => !r.pass);
  const pre = document.createElement('pre');
  pre.id = 'results';
  pre.textContent = `PASSED ${results.length - failed.length}/${results.length}\n` + results.map((r) => `${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.pass ? '' : '  :: ' + r.info}`).join('\n');
  document.body.append(pre);
  document.body.dataset.ready = '1';
})();
