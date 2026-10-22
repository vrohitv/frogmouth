/* Smoke tests. Only included by `python3 build.py --test`.
   Open test/frogmouth.test.html#smoke (served over http for OPFS),
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
    if (mode === 'shot-palette') Palette.show('retry');
    if (mode === 'shot-slash') {
      const n = Board.addNote({ x: 760, y: 120 }, true, '<p>Deploy checklist</p><p><br></p>');
      await wait(50);
      Board.focusBody(n.id);
      await type('/');
      await type('co');
    }
    if (mode === 'shot-day') document.documentElement.dataset.theme = 'day';
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

    const env = Secrets.parseEnv('# c\nexport A=1\nB="two words" # note\nC=\'x y\'\nD="multi\\nline"\nE = spaced\nbad line');
    ok('parse .env', env.length === 5 && env[1].value === 'two words' && env[2].value === 'x y' && env[3].value === 'multi\nline' && env[4].value === 'spaced', JSON.stringify(env));

    const c = await Vcrypt.create('correct horse');
    const sealed = await Vcrypt.seal(c, '{"hello":1}');
    const opened = await Vcrypt.open('correct horse', sealed);
    ok('encrypt round trip', opened.text === '{"hello":1}');
    let bad = false; try { await Vcrypt.open('wrong', sealed); } catch { bad = true; }
    ok('wrong passphrase fails', bad);
    ok('ciphertext hides plaintext', !JSON.stringify(sealed).includes('hello'));

    ok('fuzzy subsequence', fuzzy('rtb', 'retry with backoff') && !fuzzy('zzz', 'retry'));

    /* ── app in memory mode ── */
    Store.openMemory(demoData(), 'test');
    App.enter();
    await wait(100);
    ok('board renders notes', $$('.note').length === 3, $$('.note').length);
    ok('code block highlighted on load', !!$('.note pre.code .t-k'));
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
    const count = Board.current().notes.length;
    Board.select(n.id);
    keydown(document.body, 'Delete');
    ok('delete note via key', Board.current().notes.length === count - 1);
    keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac });
    ok('undo restores note', Board.current().notes.length === count && !!$(`.note[data-id="${n.id}"]`));
    Board.arrange();
    ok('arrange keeps notes', Board.current().notes.length === count);

    // palette search
    const hits = Palette.search('backoff');
    ok('palette finds note by title', hits[0] && hits[0].title === 'Retry with backoff', JSON.stringify(hits.slice(0, 2).map((x) => x.title)));
    const body2 = Palette.search('sleep');
    ok('palette finds note by body', body2.some((x) => x.title === 'Retry with backoff'), JSON.stringify(body2.map((x) => x.title)));
    ok('palette never searches secret values', Palette.search('$s3cr3t').length === 0);
    ok('palette commands', Palette.search('>arrange').some((x) => x.title === 'Arrange notes'));

    // secrets
    App.openTab('secrets');
    await wait(50);
    Secrets.setFilter('env:prod');
    ok('kv tag filter', $$('.srow').length === 2, $$('.srow').length);
    Secrets.setFilter('aws -env:prod');
    ok('negated filter', $$('.srow').length === 0);
    Secrets.setFilter('');
    ok('values masked', !$('.s-list').textContent.includes('s3cr3t'));
    ok('sidebar shows tags', $$('.tag-k').length >= 3 && $$('.tag-v').length >= 3);

    // serialization round trip
    const text = await Store.serialize();
    const parsed = JSON.parse(text);
    ok('file format', parsed.frogmouth === 1 && parsed.encrypted === false && parsed.data.boards.length === 1 && parsed.data.secrets.length === 5);
    const re = Store.normalize(JSON.parse(JSON.stringify(parsed.data)));
    ok('normalize round trip', re.boards[0].notes.length === Store.S.data.boards[0].notes.length);

    // OPFS: real file writes through the File System Access API
    if (Store.canOPFS() && location.protocol.startsWith('http')) {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('fm-test-' + Date.now(), { create: true });
        const res = await Store.openDir(dir, 'opfs');
        ok('opfs creates vault', res.ok && res.fresh);
        App.enter();
        Store.S.data.secrets.push({ id: uid(), key: 'OPFS_KEY', value: 'v', tags: [], desc: '' });
        Store.change('secrets');
        await wait(900);
        const f = await (await dir.getFileHandle('vault.frogmouth')).getFile();
        ok('opfs autosaves', (await f.text()).includes('OPFS_KEY') && Store.S.status === 'saved', Store.S.status);
        const ir = await Store.saveImage(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'x.png');
        ok('image saved to assets/', ir.path && ir.path.startsWith('assets/'));
        const fp = await Store.importFile(new File(['{"type":"excalidraw"}'], 'arch.excalidraw'));
        ok('file imported to files/', fp === 'files/arch.excalidraw', fp);
        const all = await Store.listFiles();
        ok('list files sees both', all.includes('files/arch.excalidraw') && all.some((p) => p.startsWith('assets/')), JSON.stringify(all));
        await Store.setPassphrase('passphrase1');
        const enc = await (await dir.getFileHandle('vault.frogmouth')).getFile();
        const ej = JSON.parse(await enc.text());
        ok('encrypted on disk', ej.encrypted === true && !JSON.stringify(ej).includes('OPFS_KEY'));
        Store.close();
        const again = await Store.openDir(dir, 'opfs');
        ok('reopen asks for passphrase', again.locked);
        await Store.unlock('passphrase1', again.env);
        ok('unlock restores data', Store.S.data.secrets.some((s) => s.key === 'OPFS_KEY'));
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
