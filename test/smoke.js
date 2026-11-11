import { $, $$, isMac, now, uid, esc, fuzzy, kb, kbFor, Tags } from '../src/js/00-util.js';
import { Bird } from '../src/js/01-bird.js';
import { Store } from '../src/js/03-store.js';
import { HL } from '../src/js/04-highlight.js';
import { Popup } from '../src/js/05-ui.js';
import { Peek } from '../src/js/07b-peek.js';
import { Editor } from '../src/js/06-editor.js';
import { Board } from '../src/js/07-board.js';
import { Draw } from '../src/js/07c-draw.js';
import { Secrets } from '../src/js/08-secrets.js';
import { NotesList } from '../src/js/08b-notes.js';
import { Palette } from '../src/js/09-palette.js';
import { App } from '../src/js/10-app.js';
import { History } from '../src/js/07d-history.js';
import { Export } from '../src/js/07e-export.js';

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
  // a press somewhere: down and up, as a pointer does (the board cancels its pointerdown, so focus stays put)
  const press = async (el) => {
    for (const t of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, button: 0, isPrimary: true }));
    await wait(20);
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
    if (mode === 'shot-picker' || mode === 'shot-picker-day') {
      if (mode === 'shot-picker-day') document.documentElement.dataset.theme = 'day';
      await wait(300);
      const t = [...Store.S.notes.values()].find(({ note }) => note.title === 'Today').note;
      Board.select(t.id);
      document.querySelector(`.note[data-id="${t.id}"] .note-color`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    }
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
    {
      // HTML, SVG and XML from the vault open in a sandboxed frame with a unique origin, never as this app
      const src = '<p>report</p><script>parent.x = 1</script>';
      const v = new DOMParser().parseFromString(Editor.viewer(src, 'a"<b>.html', 'text/html'), 'text/html');
      const fr = v.querySelector('iframe'), csp = (v.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '';
      ok('scripted vault files open sandboxed, cut off from the app and the network',
        fr && fr.getAttribute('sandbox') === 'allow-scripts' && fr.getAttribute('srcdoc') === src && /default-src 'none'/.test(csp) && /frame-src 'none'/.test(csp) && v.title === 'a"<b>.html',
        v.documentElement.outerHTML.slice(0, 300));
    }
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
    ok('backlinks footer', /links? here/.test(($(`.note[data-id="${welcomeId}"] .note-foot .backlinks`) || {}).title), $(`.note[data-id="${welcomeId}"] .note-foot`).innerHTML);

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
    ok('first Del only asks', Board.current().items.length === count && $(`.note[data-id="${n.id}"] .note-x.armed`) && /Click again/.test($(`.note[data-id="${n.id}"] .note-x`).title));
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
      [...$$('.pop .pop-item')].find((x) => /existing/.test(x.textContent)).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(20);
      ok('...and "existing" opens the note picker for this board', Popup.isOpen() && /Add a note to/.test($('.pop').textContent) && /Lives elsewhere/.test($('.pop').textContent));
      Popup.close();
      // the note view: a link opens the note right here, full size; you stay on this board
      const pk = () => $('.peek'), btns = () => [...$$('.peek .pk-foot .btn')].map((b) => b.getAttribute('aria-label'));
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

    // colour picker: one button on the note opens a small 3 × 3 grid of the nine papers
    {
      const c1 = Board.addNote({ x: 40, y: 3800 }, false, '<p>Colour me</p>', { color: 'moth' });
      const c2 = Board.addNote({ x: 340, y: 3800 }, false, '<p>Me too</p>', { color: 'moth' });
      await wait(30);
      const el = (n) => $(`.note[data-id="${n.id}"]`);
      const press = (n) => el(n).querySelector('.note-color').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      ok('a note has one colour button, not a row of swatches', !!el(c1).querySelector('.note-color') && !el(c1).querySelector('.sw'));
      press(c1);
      const pk = () => $('.cpick');
      ok('the button opens a small picker with the nine colours, the current one marked', !!pk() && pk().querySelectorAll('.cp-sw').length === 9 && pk().querySelector('.cp-sw.on').dataset.color === 'moth' && document.activeElement === pk().querySelector('.cp-sw.on'));
      pk().querySelector('.cp-sw[data-color="sea"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      ok('a press alone does not pick a colour', c1.color !== 'sea' && !!pk());
      pk().querySelector('.cp-sw[data-color="sea"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      ok('clicking a colour sets it and closes the picker', c1.color === 'sea' && el(c1).classList.contains('paper-sea') && !pk());
      press(c1);
      keydown(document.activeElement, '5');
      ok('a number key picks in the picker', c1.color === 'heather' && !pk());
      press(c1);
      keydown(document.activeElement, 'ArrowRight'); keydown(document.activeElement, 'ArrowDown'); keydown(document.activeElement, 'Enter');
      ok('arrows move from the current colour and Enter picks', c1.color === 'night' && !pk(), c1.color); // heather → right: dusk → down: night
      press(c1); keydown(document.activeElement, 'Escape');
      ok('Esc closes without changing', !pk() && c1.color === 'night');
      press(c1); press(c1);
      ok('a second click on the button closes it', !pk());
      press(c1); $('.board-vp').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      ok('a click outside closes it', !pk());
      Board.select(c1.id);
      el(c2).querySelector('.note-body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
      press(c2);
      ok('with several notes selected the picker says so', /Colour of 2 notes/.test(pk().textContent));
      keydown(document.activeElement, '3');
      ok('...and colours all of them', c1.color === 'apricot' && c2.color === 'apricot');
      for (const n of [c1, c2]) Board.removeEverywhere(n.id, true);
      Board.select(null);
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
      // one notch of a mouse wheel is one 10% step, not a jump across the whole range
      const notch = (dy, o = {}) => $('.board-vp').dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, bubbles: true, cancelable: true, clientX: 600, clientY: 400, ...o }));
      notch(-100);
      ok('one wheel notch in zooms 10%', Math.abs(Board.zoom() - 1.1) < 1e-9, Board.zoom());
      Board.zoomAt(1); notch(100);
      ok('one wheel notch out zooms 10%', Math.abs(Board.zoom() - 1 / 1.1) < 1e-9, Board.zoom());
      Board.zoomAt(1); notch(-3, { deltaMode: 1 });
      ok('a notch counted in lines is one step too', Math.abs(Board.zoom() - 1.1) < 1e-9, Board.zoom());
      Board.zoomAt(1); for (let i = 0; i < 10; i++) notch(-2);
      ok('a pinch still zooms in proportion', Math.abs(Board.zoom() - Math.exp(0.2)) < 1e-9, Board.zoom());
      Board.zoomAt(1);
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
      ok('Del asks once for the whole selection', Board.current().items.length === onBoard && $$('.note.arming').length === 3 && /these 3 notes/.test($('.note-x.armed').title), $$('.note.arming').length);
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
      Secrets.edit(null);
      $('.s-drawer input').value = 'OUTSIDE_KEY';
      $('.secrets').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      ok('a click outside with changes neither saves nor discards them', !$('.s-drawer').hidden && !$('.d-pending').hidden && $('.s-drawer input').value === 'OUTSIDE_KEY' && !Store.S.data.secrets.some((x) => x.key === 'OUTSIDE_KEY'));
      keydown($('.s-drawer input'), 'Escape');
      ok('Esc discards them', $('.s-drawer').hidden && Store.S.data.secrets.length === 5, Store.S.data.secrets.length);
    }
    {
      // deleting a secret: three confirmations, each waiting on its safe button
      const victim = Store.S.data.secrets.find((x) => x.key === 'STRIPE_SECRET_KEY');
      Secrets.select(victim.id);
      ok('every secret row has a delete button', $$('.srow').every((r) => r.querySelector('[data-a="delete"]')));
      ok('action buttons are icons, named in their tooltip', [...$$('.secrets .s-bar .btn'), ...$$('.modal-actions .btn')].every((b) => b.querySelector('svg.ic') && !b.textContent.trim() && b.title));
      keydown($('.s-list'), 'Delete');
      await wait(10);
      ok('Del asks first (step 1 of 3), with Cancel focused', /Step 1 of 3/.test($('.modal').textContent) && document.activeElement.getAttribute('aria-label') === 'Cancel');
      keydown(document.activeElement, 'Enter'); document.activeElement.click(); // Enter on a focused button clicks it
      await wait(10);
      ok('Enter there cancels (and Cancel closes the dialog)', !$('.modal') && Store.S.data.secrets.includes(victim), ($('.modal') || {}).textContent);
      keydown($('.s-list'), 'Delete'); await wait(10);
      $('.modal .btn.primary').click(); await wait(10);
      const nameI = $('.modal input'), go = () => $('.modal .btn.primary');
      ok('step 2 wants the key name typed out', /Step 2 of 3/.test($('.modal').textContent) && go().disabled);
      nameI.value = 'STRIPE'; nameI.dispatchEvent(new Event('input')); keydown(nameI, 'Enter'); await wait(10);
      ok('a partial name does not go on', /Step 2 of 3/.test($('.modal').textContent) && go().disabled);
      nameI.value = 'STRIPE_SECRET_KEY'; nameI.dispatchEvent(new Event('input')); keydown(nameI, 'Enter'); await wait(10);
      ok('step 3 is a last check, with Keep it focused', /Step 3 of 3/.test($('.modal').textContent) && document.activeElement.getAttribute('aria-label') === 'Keep it' && Store.S.data.secrets.includes(victim));
      go().click(); await wait(10);
      ok('only then is the secret deleted', !$('.modal') && !Store.S.data.secrets.includes(victim));
      keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
      ok('and undo brings it back', Store.S.data.secrets.includes(victim) && Store.S.data.secrets.length === 5);
    }
    {
      // editing is visible: every row has a pencil that opens the editor
      const row = $$('.srow').find((r) => r.querySelector('.s-keyname').textContent === 'DATABASE_URL');
      const pen = row.querySelector('.s-act [data-a="edit"]');
      ok('every secret row has a visible edit button', $$('.srow').every((r) => r.querySelector('.s-act [data-a="edit"]')) && !!pen && pen.getBoundingClientRect().width > 0);
      if (pen) pen.click();
      await wait(40);
      ok('the edit button opens the editor on that secret', !$('.s-drawer').hidden && $('.s-drawer .d-head h3').textContent === 'DATABASE_URL');
      keydown($('.s-drawer'), 'Escape'); await wait(20);
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
    $('.board-pill.on').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    if ($('.bp-input')) $('.bp-input').value = 'Infra ops';
    await press($('.board-vp'));
    ok('a press on the board saves a rename', infra.name === 'Infra ops' && !$('.bp-input') && $('.board-pill.on .bp-name').textContent === 'Infra ops', infra.name);
    $('.board-pill.on').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    if ($('.bp-input')) { $('.bp-input').value = 'Nope'; keydown($('.bp-input'), 'Escape'); }
    ok('Esc cancels a rename', infra.name === 'Infra ops' && !$('.bp-input'));
    $$('.board-pill')[0].click();
    ok('clicking a pill switches board', Store.S.data.ui.active === 'b:' + Store.S.data.boards[0].id);
    {
      // the open board's pill has a pencil that renames in place
      const b0 = Store.S.data.boards[0], was = b0.name;
      const pen = $('.board-pill.on .bp-edit');
      ok('the open board pill shows a rename button', !!pen && getComputedStyle(pen).opacity !== '0');
      if (pen) pen.click();
      await wait(20);
      const ri = $('.board-pill input.bp-input');
      ok('it renames in place', !!ri);
      if (ri) { ri.value = 'Renamed by pencil'; keydown(ri, 'Enter'); }
      await wait(20);
      ok('and saves the name', b0.name === 'Renamed by pencil');
      b0.name = was; Store.change('boards');
    }
    {
      // right-click a pill: rename, pin, delete (no hover cross to mis-hit)
      ok('pills have no delete cross', !$('.board-pill .bp-x'));
      const menu = async () => { $(`.board-pill[data-id="${infra.id}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 30 })); await wait(30); };
      const pickItem = (w) => { const it = $$('.pop .pop-item').find((e) => e.textContent.includes(w)); if (it) it.click(); }; // menus act on a full click (1.2.2)
      await menu();
      const labels = $$('.pop .pop-item').map((e) => e.textContent);
      ok('right-click on a pill offers rename, pin and delete', ['Rename', 'Pin', 'Delete board'].every((w) => labels.some((l) => l.includes(w))), labels.join('|'));
      pickItem('Pin'); await wait(20);
      ok('pinning from the menu marks the pill', Store.board(infra.id).pinned === true && !!$(`.board-pill[data-id="${infra.id}"] .bp-pin`));
      await menu(); pickItem('Unpin'); await wait(20);
      ok('and unpinning removes the mark and the field', !('pinned' in Store.board(infra.id)) && !$(`.board-pill[data-id="${infra.id}"] .bp-pin`));
      await menu(); pickItem('Delete board'); await wait(30);
    }
    ok('the menu deletes an empty board', !Store.board(infra.id) && $$('.board-pill').length === nBoards);
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
    {
      const foot = $(`.note[data-id="${retryRef.note.id}"] .note-foot`);
      ok('Enter closes the tag editor and shows the chips', !foot.querySelector('.tag-input') && foot.querySelectorAll('.chip').length === 4, foot.innerHTML);
      keydown(document.body, 't');
      const t2 = foot.querySelector('.tag-input');
      if (t2) t2.value += 'later';
      await press($('.board-vp'));
      ok('a press outside saves the tags and closes the editor', !foot.querySelector('.tag-input') && retryRef.note.tags.includes('later') && foot.querySelectorAll('.chip').length === 5, foot.innerHTML);
      keydown(document.body, 't');
      const t3 = foot.querySelector('.tag-input');
      if (t3) { t3.value = 'nope'; keydown(t3, 'Escape'); }
      ok('Esc leaves the tags as they were', !foot.querySelector('.tag-input') && retryRef.note.tags.includes('later') && !retryRef.note.tags.includes('nope'));
      retryRef.note.tags = retryRef.note.tags.filter((t) => t !== 'later'); Store.change('note');
    }
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
      keysItem && keysItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
      {
        // the panel: pinned boards first, two-line rows that preview the board, actions always visible
        keydown(document.body, 'j', { altKey: true, code: 'KeyJ' }); await wait(30);
        const heads = $$('.bd-list .bd-head').map((e) => e.textContent);
        ok('the panel groups pinned boards first', heads[0] === 'Pinned' && heads[1] === 'Boards' && $('.bd-list .bd-row .bd-name').textContent === 'Project 3', heads.join('|'));
        const row = $$('.bd-row').find((r) => r.querySelector('.bd-name').textContent === d.boards[0].name);
        const firstTitle = (Store.noteRef(d.boards[0].items[0].note).note.title || '').slice(0, 12);
        ok('a row previews what is on the board', !!row && !!row.querySelector('.bd-sub') && row.querySelector('.bd-sub').textContent.includes(firstTitle), row && row.textContent);
        ok('rows are comfortable to hit', row && row.getBoundingClientRect().height >= 44, row && row.getBoundingClientRect().height);
        ok('row actions are visible without hovering', row && getComputedStyle(row.querySelector('.bd-acts')).opacity !== '0');
        const bi = $('.bd-input'); bi.value = 'Proj'; bi.dispatchEvent(new Event('input')); await wait(20);
        ok('typing gives one flat list', !$('.bd-list .bd-head') && $$('.bd-row').length >= 30);
        keydown(bi, 'ArrowDown'); 
        ok('arrow keys still walk the rows', $$('.bd-row')[1].classList.contains('on'));
        keydown(bi, 'Escape'); await wait(20);
      }
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
    {
      // shapes on boards (since 1.3): additive, validated, unknown types and fields kept
      const raw = { notes: [{ id: 'n1', html: '<p>A</p>' }], boards: [{ id: 'b1', name: 'B', items: [{ note: 'n1', x: 0, y: 0, w: 200, h: 100 }], shapes: [
        { id: 's1', type: 'rect', x: 10.4, y: 20, w: 5, h: 5, color: 'sea', text: 'API', extra: { keep: 1 } },
        { id: 's2', type: 'cloud', puff: 3 },
        { id: 's3', type: 'line', a: { shape: 's1' }, b: { note: 'n1' }, head: 'end' },
        { id: 's4', type: 'line', a: { shape: 'gone' }, b: { x: 5, y: 5 } },
        'junk', { id: 's1', type: 'rect' },
      ] }, { id: 'b2', name: 'C', items: [] }] };
      const d = Store.normalize(JSON.parse(JSON.stringify(raw)));
      const sh = d.boards[0].shapes, by = (id) => sh.find((x) => x.id === id);
      ok('a box keeps unknown fields and gets the minimum size', by('s1').extra.keep === 1 && by('s1').w === 24 && by('s1').h === 24 && by('s1').color === 'sea' && by('s1').text === 'API', JSON.stringify(by('s1')));
      ok('a shape type from a newer release is kept as it is', JSON.stringify(by('s2')) === JSON.stringify(raw.boards[0].shapes[1]));
      ok('a line to something not on the board is dropped; junk and duplicates are dropped', !by('s4') && sh.length === 3, JSON.stringify(sh));
      ok('a board without shapes has no shapes field', !('shapes' in d.boards[1]) && Store.shapes(d.boards[1]).length === 0 && !('shapes' in d.boards[1]));
      const out = Store.detach(d.boards[0], 'note', 'n1', { x: 100, y: 50 });
      ok('detaching turns an attached end into a free point', out.length === 1 && out[0].end === 'b' && by('s3').b.x === 100 && by('s3').b.y === 50 && !('note' in by('s3').b));
      Store.reattach(out);
      ok('and undo attaches it again', by('s3').b.note === 'n1' && !('x' in by('s3').b));
      const nb = d.boards[1];
      const box = Store.addShape(nb, { id: 'q', type: 'rect', x: 0, y: 0, w: 40, h: 40, z: 1, color: 'moth', text: '' });
      ok('adding a shape creates the field', nb.shapes.length === 1 && nb.shapes[0] === box);
      const gone = Store.dropShape(nb, 'q');
      ok('dropping the last shape removes the field', !('shapes' in nb) && gone.shape === box);
      Store.putShape(nb, gone);
      ok('putting it back restores it', nb.shapes[0] === box);
      const sd = Store.dropShape(d.boards[0], 's1');
      ok('dropping a box frees lines attached to it, at its centre', Math.abs(by('s3').a.x - 22.4) < 0.01 && by('s3').a.y === 32 && sd.detached.length === 1, JSON.stringify(by('s3').a));
      Store.putShape(d.boards[0], sd);
      ok('and putting it back re-attaches them', by('s3').a.shape === 's1');
      const back = JSON.parse(JSON.stringify(d));
      ok('shapes survive a save', back.boards[0].shapes.length === 3 && back.boards[0].shapes.find((x) => x.id === 's2').puff === 3);
    }
    {
      // where a line meets an outline, and how it is routed
      const R = { x: 0, y: 0, w: 100, h: 100 }, near = (p, x, y) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
      ok('a box is met on its edge', near(Draw.anchor(R, 'box', { x: 300, y: 50 }), 100, 50) && near(Draw.anchor(R, 'box', { x: 150, y: 250 }), 75, 100));
      ok('an ellipse is met on its curve', near(Draw.anchor(R, 'ellipse', { x: 150, y: 150 }), 85.355, 85.355), JSON.stringify(Draw.anchor(R, 'ellipse', { x: 150, y: 150 })));
      ok('a diamond is met on its side', near(Draw.anchor(R, 'diamond', { x: 150, y: 150 }), 75, 75));
      ok('a thing asked for its own centre gives the centre', near(Draw.anchor(R, 'box', { x: 50, y: 50 }), 50, 50));
      const B = { x: 300, y: 200, w: 100, h: 100 };
      const st = Draw.route({ rect: R, kind: 'box' }, { x: 300, y: 50 }, 'straight');
      ok('a straight line stops 6 units short of what it is attached to', st.length === 2 && near(st[0], 106, 50) && near(st[1], 300, 50), JSON.stringify(st));
      const e = Draw.route({ rect: R, kind: 'box' }, { rect: B, kind: 'box' }, 'elbow');
      ok('an elbow leaves the facing sides and turns half way', e.length === 4 && near(e[0], 106, 50) && near(e[1], 200, 50) && near(e[2], 200, 250) && near(e[3], 294, 250), JSON.stringify(e));
      const v = Draw.route({ rect: R, kind: 'box' }, { rect: { x: 0, y: 400, w: 100, h: 100 }, kind: 'box' }, 'elbow');
      ok('things stacked vertically connect top to bottom', near(v[0], 50, 106) && near(v[3], 50, 394), JSON.stringify(v));
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
      ok('shared note shows where else it lives', /2 boards/.test(($(`.note[data-id="${welcome.id}"] .note-foot .nf-boards`) || {}).title));
      ok('placements keep their own geometry', Board.item(welcome.id) !== d.boards[0].items.find((it) => it.note === welcome.id));
      Board.addNote({ x: 600, y: 300 }, false, '<p>Only on Side</p>');
      const onlySide = [...Store.S.notes.values()].find(({ note }) => note.title === 'Only on Side').note;
      // delete the board through the pill's menu (confirm modal, since it has notes)
      $(`.board-pill[data-id="${side.id}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 30 }));
      await wait(30);
      $$('.pop .pop-item').find((e) => e.textContent.includes('Delete board')).click();
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

    // diagrams: boxes, lines and frames on a board
    const vpEl = () => $('.board-vp');
    const atVp = (x, y) => { const r = vpEl().getBoundingClientRect(); return { clientX: r.left + x, clientY: r.top + y }; };
    const dptr = (type, el, x, y, o = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...atVp(x, y), ...o }));
    const drawDrag = async (tool, x1, y1, x2, y2) => { keydown(document.body, tool); dptr('pointerdown', vpEl(), x1, y1); dptr('pointermove', window, x2, y2); dptr('pointerup', window, x2, y2); await wait(30); };
    const undoKey = () => keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
    {
      const b = { id: uid(), name: 'Diagram', created: now(), items: [] };
      Store.S.data.boards.push(b); Store.change('boards'); App.openTab('b:' + b.id); await wait(80);
      ok('the board has a toolbar of drawing tools', $$('.draw-bar button').length >= 5 && $('.draw-bar').getBoundingClientRect().width > 0);
      Board.zoomAt(1); await frame();
      const c0 = atVp(300, 200), p0 = Board.toBoard(c0.clientX, c0.clientY);
      await drawDrag('r', 300, 200, 460, 296);
      const s = Store.shapes(b)[0];
      ok('R then a drag draws a rectangle under the pointer, on the grid', s && s.type === 'rect' && Math.abs(s.x - p0.x) <= 8 && Math.abs(s.y - p0.y) <= 8 && s.w === 160 && s.h === 96 && s.x % 8 === 0, JSON.stringify([s, p0]));
      ok('the tool goes back to Select and the new box is being typed in', Draw.tool() === 'select' && document.activeElement.classList.contains('shape-text'));
      await type('rod xl cfv');
      ok('letters typed into a box are text, not tools', Draw.tool() === 'select' && Store.shapes(b).length === 1);
      keydown(document.activeElement, 'Escape'); await wait(20);
      ok('a box only grows when its text does not fit', s.h === 96, s.h);
      ok('the text is saved as plain text', s.text === 'rod xl cfv' && $('.shape .shape-text').textContent === 'rod xl cfv', s.text);

      Board.zoomAt(0.2); await frame();
      const c1 = atVp(400, 300), q = Board.toBoard(c1.clientX, c1.clientY);
      keydown(document.body, 'o'); dptr('pointerdown', vpEl(), 400, 300); dptr('pointerup', window, 400, 300); await wait(30);
      keydown(document.activeElement, 'Escape'); await wait(10);
      const e = Store.shapes(b)[1];
      ok('a click at 20% zoom drops a default ellipse centred under the pointer', e && e.type === 'ellipse' && e.w === 160 && e.h === 96 && Math.abs(e.x + 80 - q.x) <= 8 && Math.abs(e.y + 48 - q.y) <= 8, JSON.stringify([e, q]));
      Board.zoomAt(2.5); await frame();
      const c2 = atVp(500, 300), q2 = Board.toBoard(c2.clientX, c2.clientY);
      keydown(document.body, 'd'); dptr('pointerdown', vpEl(), 500, 300); dptr('pointerup', window, 500, 300); await wait(30);
      keydown(document.activeElement, 'Escape'); await wait(10);
      const dm = Store.shapes(b)[2];
      ok('and at 250%', dm && dm.type === 'diamond' && Math.abs(dm.x + 80 - q2.x) <= 8 && Math.abs(dm.y + 48 - q2.y) <= 8, JSON.stringify([dm, q2]));
      Board.zoomAt(1); await frame();

      const n = Board.addNote({ x: 600, y: 80 }, false, '<p>beside a box</p>');
      Board.selectAll();
      ok('select all takes notes and boxes together', Board.selection().length === 4, JSON.stringify(Board.selection()));
      const x0 = s.x, nx0 = Board.item(n.id).x;
      keydown(document.body, 'ArrowRight'); await wait(20);
      ok('arrows nudge both', s.x === x0 + 8 && Board.item(n.id).x === nx0 + 8, JSON.stringify([s.x, x0, Board.item(n.id).x, nx0]));
      Board.select(s.id); keydown(document.body, '7'); await wait(20);
      ok('1-9 colours a box', s.color === 'sea' && $(`.shape[data-id="${s.id}"]`).classList.contains('paper-sea'));
      const zBefore = s.z; Board.select(dm.id); keydown(document.body, '['); await wait(10);
      ok('[ sends a box behind everything', dm.z < Math.min(...[...b.items, ...Store.shapes(b)].filter((m) => m !== dm && m.z != null).map((m) => m.z)), JSON.stringify([dm.z, zBefore]));
      {
        const alien = { id: uid(), type: 'cloud', z: 1, puff: 2 };
        Store.addShape(b, alien); const before = JSON.stringify(alien);
        Board.select(e.id); keydown(document.body, '['); await wait(10);
        ok('shapes of a type from a newer release are never changed', JSON.stringify(alien) === before && !$(`[data-id="${alien.id}"]`), JSON.stringify(alien));
        b.shapes.splice(b.shapes.indexOf(alien), 1);
      }
      Board.select(s.id);
      keydown(document.body, 'Delete'); await wait(20);
      ok('Del deletes a box at once, with undo', Store.shapes(b).length === 2 && !$(`.shape[data-id="${s.id}"]`));
      undoKey(); await wait(30);
      ok('undo brings it back', Store.shapes(b).length === 3 && !!$(`.shape[data-id="${s.id}"]`));
      keydown(document.body, 'd', { metaKey: isMac, ctrlKey: !isMac }); await wait(20);
      ok('duplicate copies a box beside it', Store.shapes(b).length === 4 && Store.shapes(b)[3].x === s.x + 24 && Store.shapes(b)[3].text === s.text);
      keydown(document.body, 'Delete'); await wait(20);
      ok('shapes count as the board not being empty', $('.board-empty').hidden);

      keydown(document.body, 'r');
      ok('a tool shows a crosshair board', vpEl().classList.contains('drawing'));
      Board.unmount(); App.enter(); await wait(60); // what a reload from disk does: the board is mounted afresh
      ok('a reload leaves the board in Select with nothing half-drawn', Draw.tool() === 'select' && !$('.shape-preview') && !vpEl().classList.contains('drawing'));
      for (const th of ['night', 'day']) {
        document.documentElement.dataset.theme = th; await frame();
        const cs = getComputedStyle($('.shape .shape-bg').firstElementChild);
        ok(`box outlines are visible in the ${th} theme`, cs.stroke !== cs.fill && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) >= 1, cs.stroke + ' ' + cs.fill);
      }
      document.documentElement.dataset.theme = 'night';
      const serial = JSON.parse(Store.serialize()).data.boards.find((x) => x.id === b.id);
      {
        const tx = Store.addShape(b, { id: uid(), type: 'text', x: 0, y: 900, w: 160, h: 40, z: 60, color: 'moth', text: 'a label' });
        Board.unmount(); App.enter(); await wait(40);
        const outer = $(`.shape[data-id="${tx.id}"]`), cs = getComputedStyle(outer);
        ok('a text shape keeps its resize handles reachable (not clipped by its own text styles)', cs.overflow === 'visible' && cs.paddingLeft === '0px' && outer.querySelectorAll('.shape-text').length === 1);
        Draw.remove([tx.id]); await wait(10);
      }
      ok('drawn shapes are saved with the board', serial.shapes.length === 3 && serial.shapes.every((x) => x.id && x.type && Number.isFinite(x.w)));
    }

    {
      // lines and arrows that stick to notes and boxes
      const b = Board.current();
      const A = Store.addShape(b, { id: uid(), type: 'rect', x: 0, y: 0, w: 96, h: 96, z: 50, color: 'moth', text: 'A' });
      const B = Store.addShape(b, { id: uid(), type: 'ellipse', x: 400, y: 0, w: 96, h: 96, z: 51, color: 'moth', text: 'B' });
      const n = Board.addNote({ x: 0, y: 400 }, false, '<p>a note</p>');
      Board.unmount(); App.enter(); await wait(60);
      Board.fit(); await wait(450);
      const mid = (id) => { const r = (Draw.el(id) || Board.el(id)).getBoundingClientRect(), v = vpEl().getBoundingClientRect(); return [r.left - v.left + r.width / 2, r.top - v.top + r.height / 2]; };
      const connect = async (key, from, to) => { keydown(document.body, key); dptr('pointerdown', vpEl(), ...from); dptr('pointermove', window, ...to); dptr('pointerup', window, ...to); await wait(40); };
      await connect('c', mid(A.id), mid(B.id));
      const ln = Draw.lines()[0];
      ok('C draws an arrow attached at both ends', ln && ln.a.shape === A.id && ln.b.shape === B.id && ln.head === 'end' && !('x' in ln.a), JSON.stringify(ln));
      let pts = Draw.points(ln);
      ok('it runs between the outlines, not the centres', pts[0].x >= 96 && pts[pts.length - 1].x <= 400, JSON.stringify(pts));
      ok('an arrow has a head at its end only', $$(`.wire[data-id="${ln.id}"] .wire-head`).length === 1);
      B.x = 400; B.y = 320; Draw.place(B); await frame(); await frame();
      pts = Draw.points(ln);
      ok('the arrow follows a moved box', pts[pts.length - 1].y > 300 && $(`.wire[data-id="${ln.id}"] .wire-hit`).getAttribute('d').includes(pts[pts.length - 1].y.toFixed(1)), JSON.stringify(pts));

      await connect('c', mid(A.id), mid(n.id));
      const l2 = Draw.lines()[1];
      ok('an arrow can end on a note', l2 && l2.b.note === n.id, JSON.stringify(l2));
      const before = JSON.stringify(Draw.points(l2));
      const other = Store.S.data.boards[0]; Store.place(other.id, n.id, { x: 900, y: 900 });
      other.items.find((it) => it.note === n.id).x = 5000;
      Draw.redraw(); await frame(); await frame();
      ok('a note moved on another board does not move the arrow here', JSON.stringify(Draw.points(l2)) === before);
      Store.unplace(other.id, n.id);
      const h0 = Draw.points(l2)[1].y;
      Board.select(n.id); keydown(document.body, 'ArrowDown'); await frame(); await frame();
      ok('an arrow follows a note that moves', Math.abs(Draw.points(l2)[1].y - (h0 + 8)) < 0.5, JSON.stringify([h0, Draw.points(l2)]));

      Board.zoomAt(0.3); await frame();
      await connect('l', [80, 140], [200, 200]);
      const l3 = Draw.lines()[2];
      ok('L draws a plain line between two free points', l3 && l3.head === 'none' && 'x' in l3.a && 'x' in l3.b && !$(`.wire[data-id="${l3.id}"] .wire-head`), JSON.stringify(l3));
      await connect('l', [mid(n.id)[0], mid(n.id)[1]], [mid(n.id)[0] + 1, mid(n.id)[1] + 1]);
      ok('a click with the line tool leaves no stub, even on a note', Draw.lines().length === 3 && Draw.tool() === 'select');
      Board.zoomAt(1); Board.fit(); await wait(450);

      Board.select(A.id); await frame();
      ok('a selected box offers connector dots', $$('.cdot').length === 4);
      const dot = $$('.cdot')[1], dr = dot.getBoundingClientRect();
      dot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: dr.left + 4, clientY: dr.top + 4 }));
      const tb = mid(B.id), vr = vpEl().getBoundingClientRect();
      dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: vr.left + tb[0], clientY: vr.top + tb[1] }));
      dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: vr.left + tb[0], clientY: vr.top + tb[1] })); await wait(40);
      const l4 = Draw.lines()[3];
      ok('dragging from a connector dot draws an arrow from that box', l4 && l4.a.shape === A.id && l4.b.shape === B.id && l4.head === 'end', JSON.stringify(l4));
      Draw.remove([l4.id]); await wait(20);

      // select a line by clicking it; a free line moves when dragged
      Board.select(null); await frame();
      const hit = $(`.wire[data-id="${l3.id}"] .wire-hit`), hr = hit.getBoundingClientRect();
      const hx = hr.left + hr.width / 2, hy = hr.top + hr.height / 2;
      hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: hx, clientY: hy }));
      dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: hx, clientY: hy })); await frame();
      ok('clicking a line selects it', Board.selected() === l3.id && $(`.wire[data-id="${l3.id}"]`).classList.contains('sel'));
      ok('a selected line shows a handle at each end', $$('.wend').length === 2);
      const ax = l3.a.x;
      keydown(document.body, 'ArrowRight'); await frame();
      ok('arrows move a free line', l3.a.x === ax + 8);
      keydown(document.body, '4'); await frame();
      ok('1-9 colour a line', l3.color === 'rose' && $(`.wire[data-id="${l3.id}"]`).classList.contains('paper-rose'));
      keydown(document.body, 'Enter'); await wait(20);
      ok('Enter edits a line label', document.activeElement && document.activeElement.classList.contains('wire-label'));
      await type('calls');
      keydown(document.activeElement, 'Escape'); await wait(20);
      ok('the label is saved and shown on the line', l3.text === 'calls' && $$('.wire-label').some((e) => e.textContent === 'calls'), l3.text);

      // drag a line's end handle onto a box to attach it
      Board.select(l3.id); await frame();
      const end = $$('.wend')[1], er = end.getBoundingClientRect();
      end.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: er.left + 5, clientY: er.top + 5 }));
      const ta = mid(B.id);
      dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: vr.left + ta[0], clientY: vr.top + ta[1] }));
      dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: vr.left + ta[0], clientY: vr.top + ta[1] })); await wait(30);
      ok('dragging an end handle onto a box attaches it', l3.b.shape === B.id && 'x' in l3.a, JSON.stringify(l3));

      Draw.remove([A.id]); await wait(30);
      ok('deleting a box frees the ends attached to it', 'x' in ln.a && 'x' in l2.a && Draw.lines().length === 3);
      undoKey(); await wait(30);
      ok('undo attaches them again', ln.a.shape === A.id && l2.a.shape === A.id);
      ok('lines are drawn above notes', +getComputedStyle($('.wires')).zIndex > Math.max(...$$('.note').map((e) => +e.style.zIndex || 0)));
    }

    {
      // frames hold what is centred inside them; lines keep their place when a note leaves
      const b = { id: uid(), name: 'Frames', created: now(), items: [] };
      Store.S.data.boards.push(b); Store.change('boards'); App.openTab('b:' + b.id); await wait(60);
      Board.zoomAt(1); await frame();
      const fr = Store.addShape(b, { id: uid(), type: 'frame', x: 0, y: 0, w: 480, h: 320, color: 'moth', text: 'Backend' });
      const inBox = Store.addShape(b, { id: uid(), type: 'rect', x: 40, y: 40, w: 96, h: 96, z: 2, color: 'moth', text: '' });
      const outBox = Store.addShape(b, { id: uid(), type: 'rect', x: 600, y: 40, w: 96, h: 96, z: 3, color: 'moth', text: '' });
      const n = Board.addNote({ x: 200, y: 100 }, false, '<p>inside</p>');
      const ln = Store.addShape(b, { id: uid(), type: 'line', a: { note: n.id }, b: { shape: outBox.id }, head: 'end' });
      Board.unmount(); App.enter(); await wait(60);
      Board.zoomAt(1); await frame();
      ok('F is the frame tool', (keydown(document.body, 'f'), Draw.tool() === 'frame') && (keydown(document.body, 'Escape'), Draw.tool() === 'select'));
      ok('a frame shows its name and sits under notes', $('.shape-frame .frame-name').textContent === 'Backend' && +getComputedStyle($('.shape-frame')).zIndex < +getComputedStyle(Board.el(n.id)).zIndex);
      ok('a frame holds what is centred inside it', JSON.stringify(Draw.inside(fr.id).sort()) === JSON.stringify([inBox.id, n.id].sort()), JSON.stringify(Draw.inside(fr.id)));
      const fc = Board.toBoard(0, 0), inner = $('.shape-frame'), ir = inner.getBoundingClientRect();
      ok('the inside of a frame lets clicks through to the board', document.elementFromPoint(ir.left + 300, ir.top + 260) && !document.elementFromPoint(ir.left + 300, ir.top + 260).closest('.shape-frame'));
      const name = $('.shape-frame .frame-name'), r = name.getBoundingClientRect();
      name.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 4, clientY: r.top + 4 }));
      dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 84, clientY: r.top + 4 }));
      dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 84, clientY: r.top + 4 })); await wait(30);
      ok('dragging a frame moves its contents and nothing else', fr.x === 80 && inBox.x === 120 && Board.item(n.id).x === 280 && outBox.x === 600, JSON.stringify([fr.x, inBox.x, Board.item(n.id).x, outBox.x]));
      const ny0 = Board.item(n.id).y;
      {
        // its edge moves it too (corners resize)
        const fe = $(`.shape[data-id="${fr.id}"]`).getBoundingClientRect(), ex = fe.left + 1, ey = fe.top + fe.height / 2;
        const hitEl = document.elementFromPoint(ex, ey), fx0 = fr.x, bx0 = inBox.x, w0 = fr.w;
        hitEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: ex, clientY: ey }));
        dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: ex + 40, clientY: ey }));
        dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ex + 40, clientY: ey })); await wait(30);
        ok('dragging a frame by its edge moves it with its contents', fr.x === fx0 + 40 && fr.w === w0 && inBox.x === bx0 + 40, JSON.stringify([fr.x, fx0, fr.w, w0, inBox.x, bx0, hitEl.className.baseVal || hitEl.className]));
        fr.x = fx0; inBox.x = bx0; Board.item(n.id).x -= 40; Draw.place(fr); Draw.place(inBox); Board.unmount(); App.enter(); await wait(40); Board.zoomAt(1); await frame();
      }
      Board.select(fr.id); keydown(document.body, 'ArrowDown'); await frame();
      ok('nudging a frame nudges its contents', fr.y === 8 && inBox.y === 48 && Board.item(n.id).y === ny0 + 8, JSON.stringify([fr.y, inBox.y, Board.item(n.id).y, Board.selected() === fr.id, document.activeElement.className]));

      App.openTab('notes'); await wait(60);
      const saved = Store.deleteNote(n.id); Store.change('notes');
      App.openTab('b:' + b.id); await wait(60);
      ok('a note deleted from another page leaves its arrow with a free end, and the board still opens', 'x' in ln.a && Draw.lines().length === 1 && !!$(`.wire[data-id="${ln.id}"]`));
      Store.restoreNote(saved); Store.change('notes'); Board.unmount(); App.enter(); await wait(60);
      ok('restoring the note attaches the arrow again', ln.a.note === n.id);

      const p = Draw.points(ln)[0];
      Board.remove(n.id); await wait(30);
      ok('removing a note from the board leaves the arrow end where it was', 'x' in ln.a && Math.abs(ln.a.x - p.x) < 1 && Math.abs(ln.a.y - p.y) < 1, JSON.stringify([ln.a, p]));
      undoKey(); await wait(30);
      ok('undo puts the note back with its arrow attached', ln.a.note === n.id && !!Board.el(n.id));
      const q = Draw.points(ln)[1];
      Draw.remove([outBox.id]); await wait(20);
      ok('deleting a box leaves the arrow end where it was', 'x' in ln.b && Math.abs(ln.b.x - q.x) < 1 && Math.abs(ln.b.y - q.y) < 1, JSON.stringify([ln.b, q]));
      undoKey(); await wait(20);
      const pe = Draw.points(ln)[0];
      Board.select(n.id); keydown(document.body, 'Delete', { shiftKey: true }); await wait(40);
      $('.modal .btn.primary').click(); await wait(40);
      ok('deleting a note everywhere also leaves the arrow end in place', 'x' in ln.a && Math.abs(ln.a.x - pe.x) < 1, JSON.stringify([ln.a, pe]));
      undoKey(); await wait(40);
      ok('and undo re-attaches it', ln.a.note === n.id);
    }
    {
      // Fit keeps everything clear of the floating bars, frame names included
      const big = Store.addShape(Board.current(), { id: uid(), type: 'frame', x: -1200, y: -500, w: 2400, h: 1200, color: 'moth', text: 'Everything' });
      Board.unmount(); App.enter(); await wait(60);
      Board.fit(); await wait(450);
      const top = $('.hud').getBoundingClientRect().bottom, bot = $('.draw-bar').getBoundingClientRect().top;
      const rs = [...$$('.note'), ...$$('.shape'), ...$$('.frame-name')].map((e) => e.getBoundingClientRect());
      ok('Fit keeps everything between the top bar and the tool bar', rs.every((r) => r.top >= top - 1 && r.bottom <= bot + 1), JSON.stringify([top, bot, Math.min(...rs.map((r) => r.top)), Math.max(...rs.map((r) => r.bottom))]));
      Draw.remove([big.id]);
    }

    {
      // the style bar: colour, fill, dash, order; straight or elbow and arrowheads for lines; find sees shape text
      const b = Board.current();
      const box = Store.addShape(b, { id: uid(), type: 'rect', x: 0, y: 500, w: 160, h: 96, z: 9, color: 'moth', text: 'payments broker' });
      const ln = Store.addShape(b, { id: uid(), type: 'line', a: { x: 0, y: 700 }, b: { x: 200, y: 700 }, head: 'end', color: 'moth', text: 'queue' });
      Board.unmount(); App.enter(); await wait(60);
      ok('no style bar with nothing selected', !$('.draw-style') || $('.draw-style').hidden);
      Board.select(box.id); await frame();
      const press = (title) => { const x = $$('.draw-style button').find((e) => e.title.startsWith(title)); if (x) x.click(); return !!x; };
      ok('selecting a box shows its styles, without line controls', !$('.draw-style').hidden && $$('.draw-style .cp-sw').length === 9 && !$$('.draw-style button').some((x) => x.title.startsWith('Elbow')));
      press('Fill'); press('Dashed'); await frame();
      ok('fill and dash are stored only when set', box.fill === false && box.dash === true && $(`.shape[data-id="${box.id}"]`).classList.contains('nofill'));
      press('Fill'); press('Dashed');
      ok('and removed when unset', !('fill' in box) && !('dash' in box));
      $$('.draw-style .cp-sw')[3].click();
      ok('a swatch colours the selection', box.color === 'rose');
      ok('the current colour is marked', $$('.draw-style .cp-sw')[3].classList.contains('on'));
      press('To back');
      ok('To back sends it behind', box.z === Math.min(...[...b.items, ...Store.shapes(b)].filter((m) => m.z != null).map((m) => m.z)));
      Board.select(ln.id); await frame();
      ok('selecting a line shows line controls, not fill', press('Elbow') && !$$('.draw-style button').some((x) => x.title.startsWith('Fill')));
      press('Both');
      ok('a line can be an elbow with two heads', ln.route === 'elbow' && ln.head === 'both');
      await frame(); await frame();
      ok('both heads are drawn', $$(`.wire[data-id="${ln.id}"] .wire-head`).length === 2);
      press('Straight'); press('No heads'); await frame(); await frame();
      ok('straight is the absence of a route; no heads draws none', !('route' in ln) && ln.head === 'none' && !$(`.wire[data-id="${ln.id}"] .wire-head`));
      Board.setGroup([box.id, ln.id]); await frame();
      $$('.draw-style .cp-sw')[6].click();
      ok('a swatch colours a mixed selection', box.color === 'sea' && ln.color === 'sea');
      Board.select(null);
      Board.find('broker'); await wait(60);
      ok('find sees text in boxes', /1 of 1/.test($('.find-count').textContent), $('.find-count').textContent);
      Board.find('queue'); await wait(60);
      ok('and line labels', /1 of 1/.test($('.find-count').textContent), $('.find-count').textContent);
      Board.closeFind();
    }

    {
      // a board's shapes live only on it: deleting the board says so and asks first
      const b = { id: uid(), name: 'Sketch only', created: now(), items: [] };
      Store.S.data.boards.push(b); Store.addShape(b, { id: uid(), type: 'rect', x: 0, y: 0, w: 96, h: 96, z: 1, color: 'moth', text: '' });
      Store.change('boards'); App.openTab('b:' + b.id); await wait(40);
      App.commands().find((c) => c.title === 'Delete board').run(); await wait(40);
      ok('deleting a board with shapes asks first and says they go with it', !!$('.modal') && /1 shape/.test($('.modal').textContent) && !!Store.board(b.id), $('.modal') && $('.modal').textContent);
      if ($('.modal')) $('.modal .btn.primary').click();
      await wait(40);
      ok('and then deletes it', !Store.board(b.id));
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }
    {
      // drawing is in the command list and the shortcuts sheet
      const titles = App.commands().map((c) => c.title);
      ok('drawing tools are in the command list', ['Draw a rectangle', 'Draw an ellipse', 'Draw a diamond', 'Add text', 'Draw a line', 'Draw an arrow', 'Draw a frame'].every((t) => titles.includes(t)), titles.join('|'));
      App.commands().find((c) => c.title === 'Draw a frame').run();
      ok('a drawing command arms its tool', Draw.tool() === 'frame');
      Draw.setTool('select');
      keydown(document.body, '?'); await wait(40);
      ok('the shortcuts list has a Drawing section', $$('.keys-grid h3').some((e) => e.textContent === 'Drawing'));
      $('.modal .btn.primary').click(); await wait(20);
    }

    /* ── 1.4: large boards stay fast ── */
    const freshBoard = async (name) => {
      const b = { id: uid(), name, created: now(), items: [] };
      Store.S.data.boards.push(b); Store.change('boards'); App.openTab('b:' + b.id); await wait(40);
      return b;
    };
    {
      const b = await freshBoard('Perf');
      const n1 = Board.addNote({ x: 0, y: 0 }, false, '<p>One</p>'), n2 = Board.addNote({ x: 400, y: 0 }, false, '<p>Two</p>'), n3 = Board.addNote({ x: 800, y: 0 }, false, '<p>Three</p>');
      const far = Board.addNote({ x: 0, y: 400 }, false, '<p>Far</p>');
      Store.addShape(b, { id: 'pl1', type: 'line', a: { note: n1.id }, b: { note: n2.id }, head: 'end', color: 'moth', text: '' });
      Board.unmount(); Board.mount(b); await wait(300); // the feet render after a short delay, and change heights
      // moving a note rewrites only the lines attached to it
      const writes = [];
      const mo = new MutationObserver((ms) => { for (const m of ms) writes.push(m.target.closest('g') && m.target.closest('g').dataset.id); });
      mo.observe($('svg.wires'), { attributes: true, subtree: true });
      Board.item(far.id).x += 16; Draw.place(Board.item(far.id)); Board.select(far.id); keydown(document.body, 'ArrowRight'); await frame(); await frame();
      mo.disconnect();
      ok('moving a note leaves lines it is not attached to untouched', !writes.includes('pl1'), JSON.stringify(writes));
      // lookups stay right when placements move around in the list
      Board.select(n2.id); keydown(document.body, 'Delete'); keydown(document.body, 'Delete'); await wait(20);
      ok('placement lookups follow a removal', Board.item(n3.id) && Board.item(n3.id).note === n3.id && !Board.item(n2.id));
      keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac }); await wait(30);
      ok('and an undo', Board.item(n2.id) && Board.item(n2.id).note === n2.id && Board.item(n3.id).note === n3.id);
      // note bodies are skipped while off screen, but keep their real height
      const long = Board.addNote({ x: 60000, y: 60000 }, false, '<p>Tall</p>' + '<p>line</p>'.repeat(30));
      await frame(); await frame();
      Board.select(null); await frame();
      const lel = $(`.note[data-id="${long.id}"]`);
      ok('notes nobody is touching are skipped while off screen', getComputedStyle(lel).contentVisibility === 'auto', getComputedStyle(lel).contentVisibility);
      Board.select(long.id); await frame();
      ok('a selected note is left whole, so its handles and outline show', getComputedStyle(lel).contentVisibility === 'visible', getComputedStyle(lel).contentVisibility);
      Board.select(null);
      ok('an off-screen note keeps its real height', Board.rectOf(long.id).h > 500, Board.rectOf(long.id).h);
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    /* ── 1.4: undo and redo for everything on a board ── */
    const undoK = () => keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
    const redoK = () => keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac, shiftKey: true });
    {
      const b = await freshBoard('Undo');
      const a = Board.addNote({ x: 0, y: 0 }, false, '<p>Alpha</p>'), c = Board.addNote({ x: 400, y: 0 }, false, '<p>Gamma</p>');
      await wait(20);
      const steps = History.size();
      // a click only raises a note; it is not a step
      Board.select(c.id);
      await press($(`.note[data-id="${a.id}"] .note-body`));
      ok('a click that only raises a note is not an undo step', History.size() === steps, History.size() + ' vs ' + steps);
      // a drag
      const el = $(`.note[data-id="${a.id}"]`), r0 = el.getBoundingClientRect();
      el.querySelector('.note-body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: r0.left + 30, clientY: r0.top + 20, isPrimary: true }));
      dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r0.left + 30 + 120 * Board.zoom(), clientY: r0.top + 20 + 80 * Board.zoom() }));
      dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(20);
      const moved = { x: Board.item(a.id).x, y: Board.item(a.id).y };
      undoK(); await wait(30);
      ok('undo puts a dragged note back', Board.item(a.id).x === 0 && Board.item(a.id).y === 0, JSON.stringify(Board.item(a.id)));
      redoK(); await wait(30);
      ok('redo moves it again', Board.item(a.id).x === moved.x && Board.item(a.id).y === moved.y && moved.x > 0, JSON.stringify([moved, Board.item(a.id)]));
      // nudges in a row are one step
      Board.select(a.id);
      for (let i = 0; i < 3; i++) keydown(document.body, 'ArrowRight');
      await wait(20);
      undoK(); await wait(30);
      ok('three nudges in a row undo as one step', Board.item(a.id).x === moved.x, Board.item(a.id).x + ' vs ' + moved.x);
      // colour
      Board.select(a.id); keydown(document.body, '4'); await wait(20);
      ok('colour key colours', Store.noteRef(a.id).note.color === 'rose');
      undoK(); await wait(30);
      ok('undo brings the colour back', Store.noteRef(a.id).note.color !== 'rose', Store.noteRef(a.id).note.color);
      // shapes: style, text, a line end
      const s1 = { id: uid(), type: 'rect', x: 0, y: 300, w: 160, h: 96, z: 1, color: 'moth', text: 'Box' };
      Store.addShape(b, s1); Store.change('shapes'); Board.unmount(); Board.mount(b); await wait(30);
      Board.select(s1.id); await wait(10);
      [...$$('.draw-style .draw-btn')].find((x) => x.title === 'Dashed').click(); await wait(10);
      ok('the style bar dashes a box', !!Draw.get(s1.id).dash);
      undoK(); await wait(30);
      ok('undo takes the dash off again', !Draw.get(s1.id).dash, JSON.stringify(Draw.get(s1.id)));
      Draw.editText(s1.id); document.execCommand('selectAll'); document.execCommand('insertText', false, 'Renamed'); keydown($('.shape.editing .shape-text'), 'Escape'); await wait(20);
      ok('shape text changed', Draw.get(s1.id).text === 'Renamed');
      undoK(); await wait(30);
      ok('undo brings the old shape text back', Draw.get(s1.id).text === 'Box', Draw.get(s1.id).text);
      const ln = { id: uid(), type: 'line', a: { note: a.id }, b: { note: c.id }, head: 'end', color: 'moth', text: '' };
      Store.addShape(b, ln); Store.change('shapes'); await wait(20);
      Draw.get(ln.id).b = { shape: s1.id }; Store.change('shapes'); await wait(20);
      undoK(); await wait(30);
      ok('undo re-attaches a line end where it was', Draw.get(ln.id) && Draw.get(ln.id).b.note === c.id, JSON.stringify(Draw.get(ln.id)));
      // things made can be unmade, and made again
      Board.select(c.id); keydown(document.body, 'd', { metaKey: isMac, ctrlKey: !isMac }); await wait(20);
      const dup = Board.selected();
      ok('duplicate made a copy', dup && dup !== c.id && !!Store.noteRef(dup));
      undoK(); await wait(30);
      ok('undo of a duplicate removes the copy everywhere', !Board.item(dup) && !Store.noteRef(dup));
      redoK(); await wait(30);
      ok('redo brings the copy back with its text', Board.item(dup) && Store.noteRef(dup) && Store.noteRef(dup).note.title === 'Gamma');
      // a new action after an undo starts a new future
      undoK(); await wait(30);
      Board.select(a.id); keydown(document.body, 'ArrowDown'); await wait(20);
      const before = History.size();
      redoK(); await wait(30);
      ok('a new change clears redo', !Store.noteRef(dup) && History.size() === before);
      keydown(document.body, '?'); await wait(30);
      ok('the shortcuts list names redo', /Redo/.test(($('.keys-grid') || {}).textContent || ''));
      if ($('.modal')) $('.modal .btn.primary').click();
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    /* ── 1.4: Recently deleted ── */
    {
      const b = await freshBoard('Trash test');
      const n = Board.addNote({ x: 120, y: 80 }, false, '<p>Keep me safe</p>');
      Store.addShape(b, { id: 'tr-box', type: 'rect', x: 0, y: 400, w: 96, h: 96, z: 1, color: 'moth', text: '' });
      await wait(20);
      // an empty note that goes away by itself is not kept
      const empty = Board.addNote({ x: 600, y: 0 }, false); Board.removeEverywhere(empty.id, true);
      ok('an empty note that goes away by itself is not kept', !Store.trash().some((e) => e.note && e.note.id === empty.id));
      Board.removeEverywhere(n.id); await wait(20);
      const entry = Store.trash().find((e) => e.kind === 'note' && e.note.id === n.id);
      ok('a note deleted everywhere goes to Recently deleted', !!entry && !Store.noteRef(n.id) && entry.places[0].board === b.id && entry.places[0].x === 120, JSON.stringify(entry && entry.places));
      undoK(); await wait(30);
      ok('undoing the delete takes it out of Recently deleted', !!Store.noteRef(n.id) && !Store.trash().some((e) => e.note && e.note.id === n.id));
      Board.removeEverywhere(n.id); await wait(20);
      App.commands().find((c) => c.title === 'Recently deleted').run(); await wait(40);
      const row = [...$$('.trash-row')].find((r) => /Keep me safe/.test(r.textContent));
      ok('Recently deleted lists it with where it was', !!row && /Trash test/.test(row.textContent), $('.modal') && $('.modal').textContent);
      row.querySelector('[data-a="restore"]').click(); await wait(40);
      ok('restore puts the note back in the library and on its board, where it was', !!Store.noteRef(n.id) && Board.item(n.id) && Board.item(n.id).x === 120 && !Store.trash().some((e) => e.note && e.note.id === n.id));
      if ($('.modal')) keydown($('.modal'), 'Escape');
      await wait(20);
      undoK(); await wait(30);
      ok('undoing a restore sends it back to Recently deleted', !Store.noteRef(n.id) && Store.trash().some((e) => e.note && e.note.id === n.id));
      // a board, with its shapes
      App.openTab('b:' + b.id); await wait(20);
      App.commands().find((c) => c.title === 'Delete board').run(); await wait(40);
      ok('deleting a board says it goes to Recently deleted', !!$('.modal') && /Recently deleted/.test($('.modal').textContent), $('.modal') && $('.modal').textContent);
      if ($('.modal')) $('.modal .btn.primary').click();
      await wait(40);
      ok('a deleted board goes to Recently deleted', !Store.board(b.id) && Store.trash().some((e) => e.kind === 'board' && e.board.id === b.id));
      App.commands().find((c) => c.title === 'Recently deleted').run(); await wait(40);
      [...$$('.trash-row')].find((r) => /Trash test/.test(r.querySelector('.trash-title').textContent)).querySelector('[data-a="restore"]').click(); await wait(40);
      ok('a restored board comes back with its shapes', !!Store.board(b.id) && Store.shapes(Store.board(b.id)).some((x) => x.id === 'tr-box'));
      // deleting for good asks first
      const forever = [...$$('.trash-row')].find((r) => /Keep me safe/.test(r.textContent));
      forever.querySelector('[data-a="forget"]').click(); await wait(40);
      ok('deleting forever asks first', $$('.modal').length === 2 && /cannot be undone/.test($$('.modal')[1].textContent));
      $$('.modal')[1].querySelector('.btn.primary').click(); await wait(40);
      ok('and then it is gone for good', !Store.trash().some((e) => e.note && e.note.id === n.id));
      if ($('.modal')) keydown($('.modal'), 'Escape');
      await wait(20);
      {
        const gone = Board.addNote({ x: 900, y: 900 }, false, '<p>Gone for good</p>'); await wait(20);
        Board.removeEverywhere(gone.id); await wait(20);
        const e2 = Store.trash().find((e) => e.note && e.note.id === gone.id);
        Store.dropTrash(e2.id); Store.change('trash'); // what Delete forever does
        undoK(); await wait(30);
        ok('deleted forever stays gone, even with undo', !Store.noteRef(gone.id), 'came back');
      }
      if ($('.modal')) keydown($('.modal'), 'Escape');
      await wait(20);
      // old entries go after 30 days; kinds this release does not know are kept
      const d = Store.normalize({ notes: [], boards: [], trash: [
        { kind: 'note', id: 't1', at: Date.now() - 31 * 864e5, note: { id: 'old', html: '<p>old</p>' }, places: [] },
        { kind: 'note', id: 't2', at: Date.now() - 2 * 864e5, note: { id: 'new', html: '<p>new</p>' }, places: [] },
        { kind: 'sketch', id: 't3', at: Date.now() - 2 * 864e5, data: 1 }] });
      // Esc closes a dialog even after focus left it (a button inside was re-rendered away)
      App.commands().find((c) => c.title === 'Recently deleted').run(); await wait(30);
      document.activeElement.blur(); keydown(document.body, 'Escape'); await wait(20);
      ok('Esc closes a dialog that lost focus', !$('.modal'));
      ok('Recently deleted keeps 30 days', d.trash.map((e) => e.id).join() === 't2,t3', JSON.stringify(d.trash.map((e) => e.id)));
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    /* ── 1.4: copy, cut, paste, duplicate ── */
    const clipEv = (type, text) => { const dt = new DataTransfer(); if (text != null) dt.setData('text/plain', text); const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }); document.body.dispatchEvent(ev); return dt; };
    {
      const src = await freshBoard('Copy from');
      const p = Board.addNote({ x: 0, y: 0 }, false, '<p>Producer</p>'), q = Board.addNote({ x: 400, y: 0 }, false, '<p>Consumer</p>');
      Store.addShape(src, { id: 'cp-frame', type: 'frame', x: 0, y: 400, w: 400, h: 300, color: 'moth', text: 'Area' });
      Store.addShape(src, { id: 'cp-box', type: 'rect', x: 80, y: 480, w: 120, h: 80, z: 1, color: 'sea', text: 'Inside' });
      Store.addShape(src, { id: 'cp-line', type: 'line', a: { note: p.id }, b: { note: q.id }, head: 'end', color: 'moth', text: 'feeds' });
      Store.change('shapes'); Board.unmount(); Board.mount(src); await wait(40);
      Board.setGroup([p.id, q.id, 'cp-frame']);
      const dt = clipEv('copy');
      ok('copy puts the text on the clipboard too', /Producer/.test(dt.getData('text/plain')) && /Inside/.test(dt.getData('text/plain')), dt.getData('text/plain'));
      const dst = await freshBoard('Paste to');
      clipEv('paste', dt.getData('text/plain')); await wait(40);
      const notes = dst.items.map((it) => Store.noteRef(it.note).note);
      const shapes = Store.shapes(dst);
      const line = shapes.find((x) => x.type === 'line');
      ok('paste makes copies of the notes', notes.length === 2 && notes.every((n) => n.id !== p.id && n.id !== q.id) && notes.map((n) => n.title).sort().join() === 'Consumer,Producer', JSON.stringify(notes.map((n) => n.title)));
      ok('a frame comes with what it holds', shapes.some((x) => x.type === 'frame' && x.text === 'Area') && shapes.some((x) => x.type === 'rect' && x.text === 'Inside' && x.id !== 'cp-box'));
      ok('and the line between copied notes joins the copies', line && line.text === 'feeds' && notes.some((n) => n.id === line.a.note) && notes.some((n) => n.id === line.b.note), JSON.stringify(line));
      ok('the pasted things are selected', Board.selection().length === 5, Board.selection().length);
      undoK(); await wait(40);
      ok('one undo takes the whole paste away', !dst.items.length && !Store.shapes(dst).length && !notes.some((n) => Store.noteRef(n.id)));
      // pasting on the same board lands beside the original
      App.openTab('b:' + src.id); await wait(30);
      Board.setGroup([p.id]); clipEv('copy');
      clipEv('paste', 'Producer'); await wait(30);
      const copy = src.items[src.items.length - 1];
      ok('pasting on the same board lands just beside the original', copy.note !== p.id && copy.x === 24 && copy.y === 24, JSON.stringify(copy));
      // cut moves the notes themselves
      Board.setGroup([q.id]); clipEv('cut'); await wait(30);
      ok('cut takes the note off the board (it waits in All notes)', !Board.item(q.id) && !!Store.noteRef(q.id));
      App.openTab('b:' + dst.id); await wait(30);
      clipEv('paste', 'Consumer'); await wait(30);
      ok('paste after cut moves the same note here', !!Board.item(q.id) && dst.items.length === 1);
      // text from elsewhere becomes a note
      clipEv('paste', 'An idea from the browser\nwith a second line'); await wait(30);
      const fromText = dst.items.map((it) => Store.noteRef(it.note).note).find((n) => n.title === 'An idea from the browser');
      ok('pasting text from elsewhere makes a note of it', !!fromText && /second line/.test(fromText.text));
      // duplicate keeps lines and frame contents
      App.openTab('b:' + src.id); await wait(30);
      Board.setGroup(['cp-frame']); keydown(document.body, 'd', { metaKey: isMac, ctrlKey: !isMac }); await wait(30);
      ok('duplicating a frame duplicates what it holds', Store.shapes(src).filter((x) => x.type === 'rect' && x.text === 'Inside').length === 2 && Store.shapes(src).filter((x) => x.type === 'frame').length === 2);
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    {
      // after using the menu, focus stays on its button: a click on the board takes it back, and the
      // clipboard keys never act on the board while focus is in the floating bar
      const b = await freshBoard('Focus');
      const n = Board.addNote({ x: 0, y: 0 }, false, '<p>Stay</p>'); await wait(20);
      Board.select(n.id); $('.hud-menu').focus();
      const dt = new DataTransfer(); $('.hud-menu').dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true }));
      ok('cut does nothing while focus is in the floating bar', !!Board.item(n.id));
      await press($(`.note[data-id="${n.id}"] .note-body`));
      ok('a click on the board takes focus off the floating bar', !document.activeElement.closest('.hud'), document.activeElement.className);
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    /* ── 1.4: alignment guides while dragging ── */
    {
      const b = await freshBoard('Guides');
      const a = Board.addNote({ x: 0, y: 0 }, false, '<p>Anchor</p>'), m = Board.addNote({ x: 400, y: 200 }, false, '<p>Mover</p>');
      Board.item(a.id).y = 5; Board.unmount(); Board.mount(b); Board.zoomAt(1); await wait(40);
      const dragTo = async (dy, alt) => {
        const el = $(`.note[data-id="${m.id}"]`), r = el.getBoundingClientRect();
        el.querySelector('.note-body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 30, clientY: r.top + 20, isPrimary: true }));
        dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 30, clientY: r.top + 20 + dy, altKey: !!alt }));
        await frame();
        const shown = $$('.guide').length;
        dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(20);
        return shown;
      };
      // from y 200, up by 193 lands at 7: the grid says 8, the other note's top says 5
      const shown = await dragTo(-193);
      ok('a dragged note snaps to another note\'s edge', Board.item(m.id).y === 5, Board.item(m.id).y);
      ok('and a guide shows what it lines up with while dragging', shown > 0 && !$$('.guide').length, shown);
      Board.item(m.id).y = 200; Board.unmount(); Board.mount(b); await wait(30);
      await dragTo(-193, true);
      ok('Alt turns snapping off', Board.item(m.id).y === 7, Board.item(m.id).y);
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    /* ── 1.4: export ── */
    {
      const b = await freshBoard('Export me');
      const n = Board.addNote({ x: 0, y: 0 }, false, '<p>Card title</p><ul data-type="todo"><li data-checked="true">done <code>env:prod</code></li></ul><pre class="code" data-lang="js"><code>if (x) {\n  go();\n}</code></pre>');
      Store.addShape(b, { id: 'ex-box', type: 'diamond', x: 400, y: 0, w: 160, h: 96, z: 1, color: 'sea', text: 'Decide' });
      Store.addShape(b, { id: 'ex-f', type: 'frame', x: -40, y: -60, w: 700, h: 300, color: 'moth', text: 'Zone' });
      Store.addShape(b, { id: 'ex-l', type: 'line', a: { note: n.id }, b: { shape: 'ex-box' }, head: 'end', color: 'moth', text: 'yes' });
      Store.change('shapes'); Board.unmount(); Board.mount(b); await wait(40);
      const { svg } = Export.svg(b);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      ok('a board exports as a valid SVG', !doc.querySelector('parsererror') && doc.documentElement.tagName === 'svg', svg.slice(0, 200));
      ok('inline code in a list item is written once, and code keeps its indentation', (svg.match(/env:prod/g) || []).length === 1 && svg.includes('>\u00a0\u00a0go();<'), svg.match(/env:prod/g));
      ok('with its notes, shapes, frame names and line labels', /Card title/.test(svg) && /☑ done/.test(svg) && /Decide/.test(svg) && /Zone/.test(svg) && />yes</.test(svg) && doc.querySelectorAll('polygon').length === 1, svg.length);
      const blob = await Export.png(b).catch((e) => e);
      ok('and as a PNG', blob && blob.type === 'image/png' && blob.size > 1000, blob && (blob.message || blob.size));
      const md = Export.markdown('<p>Title</p><h2>Part</h2><ul data-type="todo"><li data-checked="true">a</li><li data-checked="false">b</li></ul><pre class="code" data-lang="js"><code>let x = 1;</code></pre><p>see <a class="mention" data-note="X1">@Other</a> and <b>bold</b></p><table><tbody><tr><th>k</th><th>v</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>', new Map([['X1', 'Other note']]));
      ok('notes turn into Markdown', md.includes('## Part') && md.includes('- [x] a') && md.includes('- [ ] b') && md.includes('```js\nlet x = 1;\n```') && md.includes('[[Other note]]') && md.includes('**bold**') && md.includes('| k | v |'), md);
      const titles = App.commands().map((c) => c.title);
      ok('export is in the commands', ['Export this board as SVG', 'Export this board as PNG', 'Export notes as Markdown'].every((t) => titles.includes(t)), titles.filter((t) => /Export/.test(t)).join('|'));
      App.openTab('b:' + Store.S.data.boards[0].id); await wait(30);
    }

    // OPFS: real file writes through the File System Access API
    if (Store.canOPFS() && location.protocol.startsWith('http')) {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('fm-test-' + Date.now(), { create: true });
        // browser storage is best-effort unless asked to persist: Chrome may clear it when the disk fills
        let persistAsked = 0;
        const sm = navigator.storage, realPersist = sm.persist;
        sm.persist = async () => { persistAsked++; return true; };
        const res = await Store.openDir(dir, 'opfs');
        sm.persist = realPersist;
        ok('opfs creates vault', res.ok && res.fresh);
        ok('browser storage asks the browser to keep it', persistAsked === 1, persistAsked);
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
        // the same for a browser-storage vault: a second tab writing the file must not be overwritten
        {
          await wait(30);
          const other = JSON.stringify({ frogmouth: 1, data: { ...JSON.parse(JSON.stringify(Store.S.data)), secrets: [{ id: 'y', key: 'OTHER_TAB', value: '1', tags: [] }] } });
          const ow = await (await dir.getFileHandle('vault.fm')).createWritable(); await ow.write(other); await ow.close();
          Store.S.data.secrets.push({ id: uid(), key: 'THIS_TAB', value: '1', tags: [], desc: '' }); Store.change('secrets');
          await wait(600);
          const both = await (await (await dir.getFileHandle('vault.fm')).getFile()).text();
          ok('two tabs on browser storage: the second save stops instead of overwriting', Store.S.status === 'conflict' && both.includes('OTHER_TAB') && !both.includes('"THIS_TAB"'), Store.S.status);
          await Store.keepMine();
          // with nothing unsaved here, a write from the other tab is picked up by the watcher
          await wait(30);
          const third = JSON.stringify({ frogmouth: 1, data: { ...JSON.parse(JSON.stringify(Store.S.data)), secrets: [{ id: 'z', key: 'WATCHED', value: '1', tags: [] }] } });
          const tw = await (await dir.getFileHandle('vault.fm')).createWritable(); await tw.write(third); await tw.close();
          await wait(2300);
          ok('browser storage is watched for writes from another tab', Store.S.data.secrets.some((s) => s.key === 'WATCHED'), JSON.stringify(Store.S.data.secrets.map((s) => s.key)));
        }
        // backups: a daily copy, hourly snapshots while editing, and a screen to restore one
        {
          const bdir = await dir.getDirectoryHandle('.fm-backups', { create: true });
          const put = async (name, text) => { const w = await (await bdir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
          const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
          for (let i = 0; i < 20; i++) await put(`vault-${day(i)}.fm`, '{}');
          for (let i = 0; i < 60; i++) await put(`vault-${day(0)}T${String(i % 24).padStart(2, '0')}-${String(i).padStart(2, '0')}.fm`, '{}');
          Store.S.lastSnap = 0;
          Store.S.data.secrets.push({ id: uid(), key: 'SNAP_ME', value: '1', tags: [], desc: '' }); Store.change('secrets');
          await wait(900);
          const names = []; for await (const [nm] of bdir.entries()) names.push(nm);
          const snaps = names.filter((nm) => /T\d\d-\d\d\.fm$/.test(nm)), dailies = names.filter((nm) => /-\d{4}-\d{2}-\d{2}\.fm$/.test(nm));
          ok('saving takes an hourly snapshot and keeps the newest 48', snaps.length === 48 && (await Store.readBackup(snaps.sort().pop())).includes('SNAP_ME'), snaps.length);
          ok('daily copies keep the newest 14, apart from the snapshots', dailies.length === 14, dailies.length);
          // a version to go back to
          const old = JSON.parse(JSON.stringify(Store.S.data)); old.secrets = [{ id: 'bk', key: 'FROM_BACKUP', value: '1', tags: [] }];
          await put('vault-2099-01-01.fm', JSON.stringify({ frogmouth: 1, saved: '2099-01-01T00:00:00.000Z', data: old }));
          App.commands().find((c) => c.title === 'Restore a backup…').run(); await wait(80);
          const row = [...$$('.backup-row')].find((r) => r.dataset.name === 'vault-2099-01-01.fm');
          ok('Restore lists the backups, newest first', !!row && $$('.backup-row')[0] === row, $$('.backup-row').length);
          row.click(); await wait(80);
          ok('picking one shows what is in it', /1 secret/.test(($('.backup-preview') || {}).textContent || ''), ($('.backup-preview') || {}).textContent);
          $('.backup-preview [data-a="restore"]').click(); await wait(60);
          ok('restoring asks first', $$('.modal').length === 2 && /saved as a backup first/.test($$('.modal')[1].textContent));
          $$('.modal')[1].querySelector('.btn.primary').click(); await wait(400);
          ok('restoring brings that version back', Store.S.data.secrets.length === 1 && Store.S.data.secrets[0].key === 'FROM_BACKUP');
          const after = []; for await (const [nm] of bdir.entries()) after.push(nm);
          ok('what was open is saved as a backup first', after.some((nm) => /before-restore/.test(nm)));
          undoK(); await wait(400);
          ok('and the restore can be undone', Store.S.data.secrets.some((s) => s.key === 'SNAP_ME'));
          // Markdown into the vault folder: one file per note
          const where = await Export.saveNotes();
          const mdir = where && await (await dir.getDirectoryHandle('markdown')).getDirectoryHandle(where.split('/')[1]);
          const files = []; if (mdir) for await (const [nm] of mdir.entries()) files.push(nm);
          ok('notes export as Markdown files into the vault folder', files.length === Store.S.data.notes.length && files.every((f) => f.endsWith('.md')), JSON.stringify(files));
          if ($('.modal')) keydown($('.modal'), 'Escape');
          await wait(20);
        }
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
