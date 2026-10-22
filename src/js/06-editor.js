import { modKey, clamp, now, h, debounce, esc, bus, fuzzy, markPositions, toast, copyText, isMac, isAltGr, kb } from './00-util.js';
import { Bird } from './01-bird.js';
import { Store } from './03-store.js';
import { HL } from './04-highlight.js';
import { Popup, Modal } from './05-ui.js';
import { Board } from './07-board.js';

/* ── note editor: contenteditable with / commands, @ tags, code, images ─
   Stored HTML is a small, sanitized subset:
   p h1 h2 h3 ul ol li blockquote pre.code hr b i u s code a br
   table thead tbody tr th td
   a.mention[data-note]   – link to another note
   a.bref[data-board]      – link to a board (@@ or the @ menu)
   span.fref[data-path]    – tag of a file in the vault folder
   span.sref[data-secret]  – reference to a secret (click copies)
   figure.pic[data-src]    – image, zoom/pan inside its own frame      */
export const Editor = (() => {
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  const exec = (c, v = null) => document.execCommand(c, false, v);
  const BLOCK = /^(P|LI|H1|H2|H3|BLOCKQUOTE|PRE|DIV|FIGURE|TD|TH)$/;

  /* ── sanitizing ───────────────────────────────────────────────── */
  const KEEP = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, DEL: 1, STRIKE: 1, CODE: 1, PRE: 1, H1: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, A: 1, HR: 1, SPAN: 1, FIGURE: 1, IMG: 1, MARK: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1 };
  const DROP = /^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|EMBED|NOSCRIPT|SVG|MATH|CANVAS|VIDEO|AUDIO|BUTTON|INPUT|SELECT|TEXTAREA|FORM|META|LINK|HEAD|TITLE)$/;
  const MAP = { DIV: 'P', H4: 'H3', H5: 'H3', H6: 'H3', SECTION: 'P', ARTICLE: 'P', HEADER: 'P', FOOTER: 'P', TFOOT: 'TBODY' };
  const safePath = (p) => typeof p === 'string' && /^[^:\\]+$/.test(p) && !p.split('/').includes('..');
  const safeImg = (p) => safePath(p) || /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[\w+/=]+$/i.test(p || '');

  function sanitize(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const out = document.createDocumentFragment();
    walk(t.content, out);
    return out;
  }
  function walk(src, dst) {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) { dst.append(n.data); continue; }
      if (n.nodeType !== 1) continue;
      let tag = n.tagName;
      if (DROP.test(tag)) continue;
      tag = MAP[tag] || tag;
      if (!KEEP[tag]) { walk(n, dst); continue; }
      if (tag === 'IMG') {
        const s = n.getAttribute('data-src') || n.getAttribute('src');
        if (safeImg(s)) dst.append(h('figure', { class: 'pic', contenteditable: 'false', 'data-src': s }));
        continue;
      }
      if (tag === 'FIGURE') {
        const s = n.getAttribute('data-src');
        if (n.classList.contains('pic') && safeImg(s)) {
          const f = h('figure', { class: 'pic', contenteditable: 'false', 'data-src': s });
          const hh = parseInt(n.getAttribute('data-h'), 10);
          if (hh > 40 && hh < 4000) f.setAttribute('data-h', hh);
          dst.append(f);
        } else walk(n, dst);
        continue;
      }
      if (tag === 'SPAN') {
        if (n.classList.contains('fref') && safePath(n.getAttribute('data-path'))) {
          dst.append(h('span', { class: 'fref', contenteditable: 'false', 'data-path': n.getAttribute('data-path') }, n.textContent));
        } else if (n.classList.contains('sref') && n.getAttribute('data-secret')) {
          dst.append(h('span', { class: 'sref', contenteditable: 'false', 'data-secret': n.getAttribute('data-secret') }, n.textContent));
        } else walk(n, dst);
        continue;
      }
      if (tag === 'A') {
        if (n.classList.contains('mention') && n.getAttribute('data-note')) {
          dst.append(h('a', { class: 'mention', contenteditable: 'false', 'data-note': n.getAttribute('data-note') }, n.textContent));
          continue;
        }
        if (n.classList.contains('bref') && n.getAttribute('data-board')) {
          dst.append(h('a', { class: 'bref', contenteditable: 'false', 'data-board': n.getAttribute('data-board') }, n.textContent));
          continue;
        }
        const href = n.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) {
          const a = h('a', { href, target: '_blank', rel: 'noopener noreferrer' });
          walk(n, a); dst.append(a);
        } else walk(n, dst);
        continue;
      }
      const el = document.createElement(tag);
      if (tag === 'PRE') {
        el.className = 'code';
        const lang = (n.getAttribute('data-lang') || (n.querySelector('code') && (n.querySelector('code').className.match(/language-([\w+#-]+)/) || [])[1]) || '').slice(0, 20);
        if (lang) el.setAttribute('data-lang', lang);
        el.append(h('code', null, n.textContent.replace(/\n$/, '')));
        dst.append(el);
        continue;
      }
      if (tag === 'TABLE') { table(n, el); dst.append(el); continue; }
      if (tag === 'UL' && n.getAttribute('data-type') === 'todo') el.setAttribute('data-type', 'todo');
      if (tag === 'LI' && n.hasAttribute('data-checked')) el.setAttribute('data-checked', n.getAttribute('data-checked') === 'true' ? 'true' : 'false');
      walk(n, el);
      dst.append(el);
    }
  }

  /* a table keeps only rows of cells, padded to the same width, so pasted
     spreadsheets and web tables come in as plain grids */
  function table(src, dst) {
    const rows = Array.from(src.querySelectorAll('tr')).filter((tr) => tr.closest('table') === src);
    const cols = Math.min(30, Math.max(1, ...rows.map((tr) => tr.cells.length)));
    let head = null, bodyEl = null;
    for (const tr of rows.slice(0, 500)) {
      const isHead = tr.parentNode.tagName === 'THEAD' || (!bodyEl && !head && Array.from(tr.cells).every((c) => c.tagName === 'TH'));
      const row = document.createElement('tr');
      for (let i = 0; i < cols; i++) {
        const c = tr.cells[i];
        const cell = document.createElement(isHead ? 'th' : 'td');
        if (c) walk(c, cell);
        if (!cell.firstChild) cell.append(h('br'));
        row.append(cell);
      }
      if (isHead && !bodyEl) { if (!head) { head = document.createElement('thead'); dst.append(head); } head.append(row); }
      else { if (!bodyEl) { bodyEl = document.createElement('tbody'); dst.append(bodyEl); } bodyEl.append(row); }
    }
    if (!dst.firstChild) dst.append(h('tbody', null, h('tr', null, h('td', null, h('br')))));
  }

  /* ── serializing ──────────────────────────────────────────────── */
  function serialize(body) {
    const c = body.cloneNode(true);
    for (const f of c.querySelectorAll('figure.pic')) f.replaceChildren();
    for (const p of c.querySelectorAll('pre.code')) {
      const code = p.querySelector('code');
      const txt = (code ? code.textContent : p.textContent).replace(/\n$/, '');
      p.removeAttribute('data-auto');
      p.replaceChildren(h('code', null, txt));
    }
    for (const el of c.querySelectorAll('.missing')) el.classList.remove('missing');
    // trailing empty paragraphs are noise
    while (c.lastChild && c.lastChild.nodeName === 'P' && !c.lastChild.textContent.trim() && !c.lastChild.querySelector('figure,span,a') && c.childNodes.length > 1) c.lastChild.remove();
    const html = c.innerHTML;
    return { html, ...derive(c) };
  }

  /* plain text + inferred title from a body element (or html string) */
  function derive(root) {
    if (typeof root === 'string') { const t = document.createElement('template'); t.innerHTML = root; root = t.content; }
    const lines = [];
    const blocks = root.querySelectorAll ? root.querySelectorAll('p,h1,h2,h3,li,blockquote,pre,tr') : [];
    for (const b of blocks) {
      if (b.tagName === 'BLOCKQUOTE' && b.querySelector('p')) continue;
      if (b.closest('li') && b.tagName !== 'LI') continue;
      if (b.closest('td,th')) continue;
      // a table row is one line, its cells separated by two spaces
      lines.push(b.tagName === 'TR' ? Array.from(b.children, (c) => c.textContent.trim()).join('  ') : b.textContent);
    }
    if (!lines.length) lines.push(root.textContent || '');
    const text = lines.join('\n');
    const first = lines.map((l) => l.trim()).find(Boolean) || '';
    const title = (first.split('\n')[0] || '').slice(0, 120);
    return { text, title };
  }

  /* ── selection helpers ────────────────────────────────────────── */
  const rng = () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };
  function lineBlock(node, root) {
    for (let n = node; n && n !== root; n = n.parentNode) if (n.nodeType === 1 && BLOCK.test(n.tagName)) return n;
    return null;
  }
  function textBefore(block) {
    const r = rng(); if (!r) return '';
    const x = document.createRange();
    x.selectNodeContents(block);
    try { x.setEnd(r.startContainer, r.startOffset); } catch { return ''; }
    return x.toString();
  }
  function selectBetween(n1, o1, n2, o2) {
    const r = document.createRange();
    r.setStart(n1, o1); r.setEnd(n2, o2);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function caretRect() {
    const r = rng(); if (!r) return null;
    const c = r.cloneRange(); c.collapse(true);
    const rects = c.getClientRects();
    if (rects.length) return rects[0];
    const n = c.startContainer.nodeType === 1 ? c.startContainer : c.startContainer.parentNode;
    return n.getBoundingClientRect();
  }
  function placeCaret(node, atEnd = true) {
    const r = document.createRange();
    r.selectNodeContents(node); r.collapse(!atEnd);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  /* character offset of the caret inside an element, and the reverse */
  function getOff(root) {
    const r = rng(); if (!r) return [0, 0];
    const x = document.createRange(); x.selectNodeContents(root);
    x.setEnd(r.startContainer, r.startOffset);
    const a = x.toString().length;
    x.setEnd(r.endContainer, r.endOffset);
    return [a, x.toString().length];
  }
  function setOff(root, a, b = a) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0, n, sN = null, sO = 0, eN = null, eO = 0;
    while ((n = tw.nextNode())) {
      const L = n.data.length;
      if (!sN && a <= acc + L) { sN = n; sO = a - acc; }
      if (!eN && b <= acc + L) { eN = n; eO = b - acc; break; }
      acc += L;
    }
    if (!sN) { placeCaret(root, true); return; }
    selectBetween(sN, sO, eN || sN, eN ? eO : sO);
  }

  /* ── code blocks ─────────────────────────────────────────────── */
  const undo = new WeakMap(); // code -> {stack, i, t}
  function snap(code, force) {
    let u = undo.get(code);
    if (!u) { u = { stack: [], i: -1, t: 0 }; undo.set(code, u); }
    const st = { text: code.textContent, off: getOff(code)[0] };
    if (!force && u.i >= 0 && now() - u.t < 600) u.stack[u.i] = st;
    else { u.stack.length = u.i + 1; u.stack.push(st); u.i++; if (u.stack.length > 200) { u.stack.shift(); u.i--; } }
    u.t = now();
  }
  function codeUndo(code, dir) {
    const u = undo.get(code); if (!u) return;
    const j = u.i + dir;
    if (j < 0 || j >= u.stack.length) return;
    u.i = j; u.t = 0;
    const st = u.stack[j];
    paint(code, st.text, st.off);
  }
  /* Wrap each line of highlighted HTML in <span class="ln">, closing and reopening any
     token span that crosses a line break. The numbers come from a CSS counter on
     .ln::before, so they are never part of the text: not copied, saved or searched,
     and invisible to the caret-offset maths. The always-present trailing newline is
     left outside, so it does not get a number of its own. */
  function numberLines(html) {
    let out = '<span class="ln">', open = null;
    const parts = html.match(/<span class="[^"]+">|<\/span>|\n|[^<\n]+|</g) || [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === '\n') {
        if (i === parts.length - 1) break; // the trailing newline
        out += (open ? '</span>' : '') + '</span>\n<span class="ln">' + (open || '');
      } else {
        if (p.startsWith('<span')) open = p;
        else if (p === '</span>') open = null;
        out += p;
      }
    }
    return out + (open ? '</span>' : '') + '</span>\n';
  }

  function paint(code, text, off) {
    if (!text.endsWith('\n')) text += '\n';
    const pre = code.parentNode;
    const lang = pre.getAttribute('data-lang') || '';
    if (!lang) pre.setAttribute('data-auto', text.trim() ? HL.detect(text) : 'code');
    else pre.removeAttribute('data-auto');
    code.innerHTML = numberLines(HL.highlight(text, lang));
    const lines = text.split('\n').length - 1;
    code.style.setProperty('--lnw', Math.max(2, String(lines).length) + 'ch');
    if (off != null) setOff(code, off);
  }
  function rehl(code, keepCaret = true) {
    const [a, b] = keepCaret ? getOff(code) : [null, null];
    const text = code.textContent;
    paint(code, text, null);
    if (keepCaret && a != null) setOff(code, a, b);
  }
  function codeInsert(code, str) {
    const [a, b] = getOff(code);
    const t = code.textContent;
    paint(code, t.slice(0, a) + str + t.slice(b), a + str.length);
    snap(code, true);
  }
  function ensureCode(pre) {
    let code = pre.querySelector(':scope > code');
    if (!code) { code = h('code', null, pre.textContent); pre.replaceChildren(code); }
    return code;
  }
  function ensureAfter(pre) {
    if (!pre.nextElementSibling) pre.after(h('p', null, h('br')));
  }
  function exitCode(pre, code) {
    const t = code.textContent.replace(/\n+$/, '');
    paint(code, t, null);
    pre.scrollLeft = 0;
    ensureAfter(pre);
    placeCaret(pre.nextElementSibling, false);
  }

  /* ── images: each zooms and pans inside its own frame ─────────── */
  const picState = new WeakMap();
  function hydratePic(fig) {
    if (fig.querySelector('img')) return;
    const img = h('img', { alt: '', draggable: 'false' });
    const ui = h('div', { class: 'pic-ui' },
      h('button', { 'data-z': 'out', title: 'Zoom out', text: '−' }),
      h('button', { 'data-z': 'fit', title: 'Fit (double-click image)', class: 'pic-pct', text: '100%' }),
      h('button', { 'data-z': 'in', title: 'Zoom in', text: '+' }));
    const grip = h('div', { class: 'pic-grip', title: 'Drag to resize. Double-click for natural height.' });
    fig.replaceChildren(img, ui, grip);
    const st = { s: 1, x: 0, y: 0, fit: 1, nw: 0, nh: 0 };
    picState.set(fig, st);
    const src = fig.getAttribute('data-src');
    const set = (u) => { if (u) img.src = u; else { fig.classList.add('missing'); fig.title = 'Image not found: ' + src; } };
    if (src.startsWith('data:')) set(src); else Store.resolveImage(src).then(set);
    img.onload = () => { st.nw = img.naturalWidth; st.nh = img.naturalHeight; sizePic(fig); fitPic(fig); };
  }
  function sizePic(fig) {
    const st = picState.get(fig); if (!st || !st.nw) return;
    const w = fig.clientWidth || 240;
    const want = +fig.getAttribute('data-h') || Math.min(360, Math.round(st.nh * (w / st.nw)));
    fig.style.height = Math.max(60, want) + 'px';
  }
  function fitPic(fig) {
    const st = picState.get(fig); if (!st || !st.nw) return;
    const w = fig.clientWidth, hh = fig.clientHeight;
    st.fit = Math.min(w / st.nw, hh / st.nh);
    st.s = st.fit;
    st.x = (w - st.nw * st.s) / 2; st.y = (hh - st.nh * st.s) / 2;
    applyPic(fig);
  }
  function applyPic(fig) {
    const st = picState.get(fig);
    const img = fig.querySelector('img');
    img.style.width = st.nw + 'px'; img.style.height = st.nh + 'px';
    img.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`;
    fig.querySelector('.pic-pct').textContent = Math.round(st.s * 100) + '%';
    fig.classList.toggle('zoomed', st.s > st.fit * 1.01);
  }
  function zoomPic(fig, f, lx, ly) {
    const st = picState.get(fig); if (!st || !st.nw) return;
    if (lx == null) { lx = fig.clientWidth / 2; ly = fig.clientHeight / 2; }
    const ns = clamp(st.s * f, Math.min(st.fit, 0.05), 16);
    st.x = lx - (lx - st.x) * (ns / st.s);
    st.y = ly - (ly - st.y) * (ns / st.s);
    st.s = ns;
    applyPic(fig);
  }
  const boardZ = () => (typeof Board !== 'undefined' ? Board.zoom() : 1);
  function local(fig, e) {
    const r = fig.getBoundingClientRect(), z = boardZ();
    return [(e.clientX - r.left) / z, (e.clientY - r.top) / z];
  }
  // global listeners so pictures in any note work
  document.addEventListener('wheel', (e) => {
    const fig = e.target.closest && e.target.closest('figure.pic');
    if (!fig || e.target.closest('.pic-ui')) return;
    e.preventDefault(); e.stopPropagation();
    const [lx, ly] = local(fig, e);
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomPic(fig, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0025)), lx, ly);
  }, { passive: false, capture: true });
  document.addEventListener('pointerdown', (e) => {
    const fig = e.target.closest && e.target.closest('figure.pic');
    if (!fig || e.button !== 0) return;
    const btn = e.target.closest('.pic-ui button');
    if (btn) {
      e.preventDefault(); e.stopPropagation();
      const z = btn.dataset.z;
      if (z === 'in') zoomPic(fig, 1.25); else if (z === 'out') zoomPic(fig, 0.8); else fitPic(fig);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const st = picState.get(fig); if (!st) return;
    const sx = e.clientX, sy = e.clientY, z = boardZ();
    if (e.target.classList.contains('pic-grip')) {
      const h0 = fig.clientHeight;
      const mv = (ev) => { fig.style.height = clamp(h0 + (ev.clientY - sy) / z, 60, 3000) + 'px'; };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        fig.setAttribute('data-h', Math.round(fig.clientHeight)); fitPic(fig);
        fig.dispatchEvent(new Event('input', { bubbles: true }));
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return;
    }
    const ox = st.x, oy = st.y;
    fig.classList.add('panning');
    const mv = (ev) => { st.x = ox + (ev.clientX - sx) / z; st.y = oy + (ev.clientY - sy) / z; applyPic(fig); };
    const up = () => { fig.classList.remove('panning'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }, true);
  document.addEventListener('dblclick', (e) => {
    const fig = e.target.closest && e.target.closest('figure.pic');
    if (!fig) return;
    e.preventDefault(); e.stopPropagation();
    if (e.target.classList.contains('pic-grip')) {
      fig.removeAttribute('data-h'); sizePic(fig); fitPic(fig);
      fig.dispatchEvent(new Event('input', { bubbles: true }));
    } else fitPic(fig);
  }, true);

  /* ── refresh chips after load / when titles change ───────────── */
  function hydrate(body) {
    for (const p of body.querySelectorAll('pre.code')) { const c = ensureCode(p); paint(c, c.textContent, null); ensureAfter(p); }
    for (const f of body.querySelectorAll('figure.pic')) hydratePic(f);
    refreshChips(body);
    if (!body.firstChild) body.append(h('p', null, h('br')));
  }
  function refreshChips(body) {
    for (const a of body.querySelectorAll('a.mention')) {
      const ref = Store.noteRef(a.dataset.note);
      const t = ref ? '@' + (ref.note.title || 'Untitled') : a.textContent.replace(/^@?/, '@');
      if (a.textContent !== t) a.textContent = t;
      a.classList.toggle('missing', !ref);
      a.title = ref ? `${ref.board ? ref.board.name : 'On no board'} — click to open` : 'Note was deleted';
    }
    for (const a of body.querySelectorAll('a.bref')) {
      const b = Store.board(a.dataset.board);
      if (b && a.textContent !== b.name) a.textContent = b.name;
      a.classList.toggle('missing', !b);
      a.title = b ? `Board · ${b.items.length} ${b.items.length === 1 ? 'note' : 'notes'} — click to open` : 'Board was deleted';
    }
    for (const s of body.querySelectorAll('span.sref')) {
      const x = Store.secret(s.dataset.secret);
      if (x && s.textContent !== x.key) s.textContent = x.key;
      s.classList.toggle('missing', !x);
      s.title = x ? 'Click to copy the value' : 'Secret was deleted';
    }
    for (const s of body.querySelectorAll('span.fref')) {
      const p = s.dataset.path;
      if (!s.textContent) s.textContent = p.split('/').pop();
      s.title = p + ' — click for options';
    }
  }

  /* ── triggers: / commands and @ tags ─────────────────────────── */
  let trig = null; // {kind, node, off, body, ctx}
  const SLASH = [
    { id: 'p', label: 'Text', hint: 'plain paragraph', icon: 'note', k: 'text paragraph p' },
    { id: 'h1', label: 'Heading 1', hint: '#', icon: 'cmd', k: 'h1 heading title' },
    { id: 'h2', label: 'Heading 2', hint: '##', icon: 'cmd', k: 'h2 heading subtitle' },
    { id: 'h3', label: 'Heading 3', hint: '###', icon: 'cmd', k: 'h3 heading' },
    { id: 'ul', label: 'Bullet list', hint: '-', icon: 'cmd', k: 'bullet list ul unordered' },
    { id: 'ol', label: 'Numbered list', hint: '1.', icon: 'cmd', k: 'numbered list ol ordered' },
    { id: 'todo', label: 'Todo list', hint: '[]', icon: 'cmd', k: 'todo checkbox task check' },
    { id: 'code', label: 'Code block', hint: '``` lang', icon: 'cmd', k: 'code block snippet pre' },
    { id: 'quote', label: 'Quote', hint: '>', icon: 'cmd', k: 'quote blockquote' },
    { id: 'hr', label: 'Divider', hint: '---', icon: 'cmd', k: 'divider hr line rule' },
    { id: 'table', label: 'Table', hint: '/table 4x3', icon: 'list', k: 'table grid rows columns cells' },
    { id: 'image', label: 'Image', hint: 'from vault or computer', icon: 'image', k: 'image picture png screenshot upload' },
    { id: 'file', label: 'File tag', hint: 'any file in the vault', icon: 'folder', k: 'file attach excalidraw pdf tag' },
    { id: 'mention', label: 'Link a note', hint: '@', icon: 'note', k: 'mention link note reference @' },
    { id: 'board', label: 'Link a board', hint: '@@', icon: 'board', k: 'board link reference open @@' },
    { id: 'secret', label: 'Secret reference', hint: 'copies on click', icon: 'key', k: 'secret key env password token' },
    { id: 'link', label: 'Web link', hint: 'url', icon: 'link', k: 'link url href web' },
    { id: 'date', label: 'Today’s date', hint: '', icon: 'cmd', k: 'date today time now' },
  ];

  /* shown at the top of the / menu while the caret is in a table */
  const TABLE_OPS = [
    { id: 'row-below', label: 'Add row below', hint: kb('enter') + ' in the last row', icon: 'plus', k: 'table row insert add below' },
    { id: 'row-above', label: 'Add row above', icon: 'plus', k: 'table row insert add above' },
    { id: 'col-right', label: 'Add column right', icon: 'plus', k: 'table column col insert add right' },
    { id: 'col-left', label: 'Add column left', icon: 'plus', k: 'table column col insert add left' },
    { id: 'row-del', label: 'Delete row', icon: 'x', k: 'table row delete remove' },
    { id: 'col-del', label: 'Delete column', icon: 'x', k: 'table column col delete remove' },
    { id: 'table-del', label: 'Delete table', icon: 'x', k: 'table delete remove' },
  ];
  const cellAt = () => { const r = rng(); const n = r && r.startContainer; const e = n && (n.nodeType === 1 ? n : n.parentNode); return e && e.closest ? e.closest('td,th') : null; };

  function slashItems(q) {
    q = q.toLowerCase();
    const [cmd] = q.split(' ');
    const out = [];
    for (const it of (cellAt() ? TABLE_OPS.concat(SLASH) : SLASH)) {
      const m = fuzzy(cmd, (it.label + ' ' + it.k).toLowerCase());
      // a two-word label ("Delete row") wins when all of it is typed
      if (m) out.push({ ...it, sc: m.s + (it.label.toLowerCase().startsWith(cmd) ? 50 : 0) + (q.trim() !== cmd && it.label.toLowerCase().startsWith(q.trim()) ? 100 : 0) });
    }
    return cmd ? out.sort((a, b) => b.sc - a.sc) : (cellAt() ? TABLE_OPS.concat(SLASH) : SLASH.slice());
  }

  let filesCache = { at: 0, list: [] };
  async function vaultFiles() {
    if (now() - filesCache.at < 8000) return filesCache.list;
    filesCache = { at: now(), list: await Store.listFiles() };
    return filesCache.list;
  }
  bus.on('loaded', () => { filesCache = { at: 0, list: [] }; });

  /* @ links a note, a file or a board; @@ lists boards only */
  function mentionItems(q, selfId) {
    q = q.toLowerCase().trim();
    const boardsOnly = q.startsWith('@');
    if (boardsOnly) q = q.slice(1).trim();
    const out = [];
    for (const b of Store.S.data.boards) {
      const m = fuzzy(q, b.name.toLowerCase());
      if (m) out.push({ kind: 'board', id: b.id, label: b.name, labelHtml: markPositions(b.name, m.p), hint: `board · ${b.items.length} ${b.items.length === 1 ? 'note' : 'notes'}`, icon: 'board', sc: m.s - (boardsOnly ? 0 : 3) + (b.opened || 0) / 1e13 });
    }
    if (boardsOnly) return out.sort((a, b) => b.sc - a.sc).slice(0, 40);
    for (const [id, { note, board }] of Store.S.notes) {
      if (id === selfId) continue;
      const t = note.title || 'Untitled';
      const m = fuzzy(q, t.toLowerCase());
      if (m) out.push({ kind: 'note', id, label: t, labelHtml: markPositions(t, m.p), hint: board ? board.name : 'on no board', icon: 'note', sc: m.s + (note.updated || 0) / 1e13 });
    }
    for (const p of filesCache.list) {
      const m = fuzzy(q, p.toLowerCase());
      if (m && (q || out.length < 12)) out.push({ kind: 'file', path: p, label: p, labelHtml: markPositions(p, m.p), hint: 'file', icon: /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p) ? 'image' : 'folder', sc: m.s - 5 });
    }
    out.sort((a, b) => b.sc - a.sc);
    return out.slice(0, 40);
  }

  function startTrigger(kind, body, ctx) {
    const r = rng(); if (!r || r.startContainer.nodeType !== 3) return;
    const node = r.startContainer, off = r.startOffset - 1;
    if (node.data[off] !== kind) return;
    const prevCh = node.data[off - 1];
    if (prevCh && !/[\s ([{]/.test(prevCh)) return;
    const t = (trig = { kind, node, off, body, ctx });
    const rect = caretRect();
    if (kind === '@') vaultFiles().then(() => trig && trig.kind === '@' && Popup.update(mentionItems(query(), ctx.note.id)));
    Popup.open({
      x: rect.left, y: rect.bottom, above: rect.top,
      items: kind === '/' ? slashItems('') : mentionItems('', ctx.note.id),
      empty: kind === '/' ? 'No command' : 'No notes or files match',
      onPick: (it) => { trig = t; applyTrigger(it); },
      onClose: () => { if (trig === t) trig = null; },
    });
  }
  function query() {
    const r = rng();
    if (!trig || !r || r.startContainer !== trig.node || r.startOffset <= trig.off) return null;
    return trig.node.data.slice(trig.off + 1, r.startOffset).replace(/\u00a0/g, ' ');
  }
  function updateTrigger() {
    if (!trig) return;
    const q = query();
    if (q == null || q.length > 48 || /\n/.test(q) || (trig.kind === '/' && /\s\s/.test(q)) || (trig.kind === '@' && /\s{2}/.test(q))) { Popup.close(); return; }
    const items = trig.kind === '/' ? slashItems(q) : mentionItems(q, trig.ctx.note.id);
    if (!items.length && /\s$/.test(q)) { Popup.close(); return; }
    Popup.update(items);
  }
  function eatTrigger() {
    const r = rng();
    if (!trig) return '';
    const q = query() || '';
    selectBetween(trig.node, trig.off, trig.node, trig.off + 1 + q.length);
    exec('delete');
    return q;
  }
  function applyTrigger(it) {
    const t = trig; if (!t) return;
    const q = eatTrigger();
    trig = null;
    if (t.kind === '@') return insertRef(it);
    const arg = q.split(' ').slice(1).join(' ').trim();
    command(it.id, t.body, t.ctx, arg);
  }

  /* chips and images go in through the Range API: Chrome's insertHTML
     misplaces contenteditable=false nodes at the end of a block */
  function bodyOf(node) { const e = node && (node.nodeType === 1 ? node : node.parentNode); return e && e.closest('.note-body'); }
  function insertInline(el) {
    const r = rng(); if (!r) return;
    const body = bodyOf(r.startContainer); if (!body) return;
    r.deleteContents();
    const sp = document.createTextNode('\u00a0');
    r.insertNode(sp); r.insertNode(el);
    const nr = document.createRange(); nr.setStart(sp, 1); nr.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(nr);
    refreshChips(body); commitSoon(body);
  }
  function insertBlock(el) {
    const r = rng();
    const body = r && bodyOf(r.startContainer); if (!body) return;
    let top = r.startContainer;
    while (top && top.parentNode !== body) top = top.parentNode;
    if (top && top.nodeType === 1 && top.tagName === 'P' && !top.textContent.trim() && !top.querySelector('figure,a,span,img')) top.replaceWith(el);
    else if (top) top.after(el); else body.append(el);
    let next = el.nextElementSibling;
    if (!next || next.tagName !== 'P') { next = h('p', null, h('br')); el.after(next); }
    placeCaret(next, false);
    if (el.matches('figure.pic')) hydratePic(el);
    commitSoon(body);
  }
  function insertRef(it) {
    if (it.kind === 'note') insertInline(h('a', { class: 'mention', contenteditable: 'false', 'data-note': it.id }, '@' + it.label));
    else if (it.kind === 'board') insertInline(h('a', { class: 'bref', contenteditable: 'false', 'data-board': it.id }, it.label));
    else if (it.kind === 'file') {
      if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(it.path) && it.asImage) insertPic(it.path);
      else insertInline(h('span', { class: 'fref', contenteditable: 'false', 'data-path': it.path }, it.path.split('/').pop()));
    } else if (it.kind === 'secret') insertInline(h('span', { class: 'sref', contenteditable: 'false', 'data-secret': it.id }, it.label));
  }
  function insertPic(src) { insertBlock(h('figure', { class: 'pic', contenteditable: 'false', 'data-src': src })); }

  /* Chrome sometimes nests lists/blocks inside <p>; flatten, keeping the caret */
  const NESTED = ':scope > :is(p,h1,h2,h3) > :is(ul,ol,pre,blockquote,p,h1,h2,h3,figure,hr,table)';
  const BLOCKY = /^(UL|OL|PRE|BLOCKQUOTE|P|H1|H2|H3|FIGURE|HR|TABLE)$/;
  function fixNesting(body) {
    if (!body.querySelector(NESTED)) return;
    // Remember the caret by node, not by character count: in a fresh, empty
    // list item "after N characters" also matches the end of the line above.
    const r = rng();
    const had = r && body.contains(r.startContainer);
    const saved = had && { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset };
    const [a, b] = had ? getOff(body) : [0, 0];
    for (const child of body.querySelectorAll(NESTED)) {
      const parent = child.parentNode;
      if (!parent || parent === body || !parent.parentNode) continue;
      const out = [];
      let run = null;
      for (const n of Array.from(parent.childNodes)) {
        if (n.nodeType === 1 && BLOCKY.test(n.tagName)) { run = null; out.push(n); }
        else { if (!run) { run = document.createElement(parent.tagName); out.push(run); } run.append(n); }
      }
      parent.replaceWith(...out.filter((n) => !(n.tagName === parent.tagName && !BLOCKY.test(n.firstChild && n.firstChild.nodeName) && !n.textContent.replace(/[\s\u200b]/g, '') && !n.querySelector('br,a,span,code'))));
    }
    if (!had) return;
    if (body.contains(saved.sc) && body.contains(saved.ec)) {
      try {
        const nr = document.createRange();
        nr.setStart(saved.sc, Math.min(saved.so, saved.sc.nodeType === 3 ? saved.sc.length : saved.sc.childNodes.length));
        nr.setEnd(saved.ec, Math.min(saved.eo, saved.ec.nodeType === 3 ? saved.ec.length : saved.ec.childNodes.length));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(nr);
        return;
      } catch {}
    }
    setOff(body, a, b);
  }

  /* ── block commands ──────────────────────────────────────────── */
  function command(id, body, ctx, arg = '') {
    body.focus();
    const r = rng();
    const block = r && lineBlock(r.startContainer, body);
    switch (id) {
      case 'p': exec('formatBlock', 'p'); break;
      case 'h1': case 'h2': case 'h3': exec('formatBlock', id); break;
      case 'quote': exec('formatBlock', 'blockquote'); break;
      case 'ul': if (!block || !block.closest('ul')) exec('insertUnorderedList'); break;
      case 'ol': if (!block || !block.closest('ol')) exec('insertOrderedList'); break;
      case 'todo': {
        if (!block || !block.closest('ul')) exec('insertUnorderedList');
        const r2 = rng();
        const ul = r2 && lineBlock(r2.startContainer, body) && lineBlock(r2.startContainer, body).closest('ul');
        if (ul) { ul.setAttribute('data-type', 'todo'); for (const li of ul.children) if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', arg === 'x' ? 'true' : 'false'); }
        break;
      }
      case 'code': {
        const b = block && block !== body && block.tagName !== 'LI' ? block : null;
        const pre = h('pre', { class: 'code' });
        if (arg) pre.setAttribute('data-lang', arg.toLowerCase());
        const code = h('code', null, (b && b.tagName !== 'PRE' ? b.textContent : '') + '\n');
        pre.append(code);
        if (b && b.tagName !== 'PRE') b.replaceWith(pre); else if (b) b.after(pre); else body.append(pre);
        ensureAfter(pre);
        paint(code, code.textContent, Math.max(0, code.textContent.length - 1));
        snap(code, true);
        break;
      }
      case 'hr': {
        const p = h('p', null, h('br'));
        const hr = h('hr');
        if (block && block.parentNode === body) {
          if (!block.textContent.trim()) block.replaceWith(hr); else block.after(hr);
        } else body.append(hr);
        hr.after(p); placeCaret(p, false);
        break;
      }
      case 'table': {
        if (cellAt()) break; // no tables inside tables
        const m = /^(\d{1,2})\s*[x×*]\s*(\d{1,3})$/i.exec(arg);
        const cols = m ? clamp(+m[1], 1, 12) : 3, rows = m ? clamp(+m[2], 1, 100) : 2;
        const t = h('table', null,
          h('thead', null, h('tr', null, Array.from({ length: cols }, () => h('th', null, h('br'))))),
          h('tbody', null, Array.from({ length: rows }, () => h('tr', null, Array.from({ length: cols }, () => h('td', null, h('br')))))));
        insertBlock(t);
        placeCaret(t.querySelector('th'), false);
        break;
      }
      case 'row-below': case 'row-above': case 'col-right': case 'col-left': case 'row-del': case 'col-del': case 'table-del': tableOp(id, body); break;
      case 'date': exec('insertText', new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })); break;
      case 'mention': exec('insertText', '@'); startTrigger('@', body, ctx); break;
      case 'board': exec('insertText', '@'); startTrigger('@', body, ctx); exec('insertText', '@'); updateTrigger(); break;
      case 'link': linkCmd(); break;
      case 'image': pickImage(); break;
      case 'file': pickFile(); break;
      case 'secret': pickSecret(); break;
    }
    fixNesting(body);
    commitSoon(body);
  }

  /* ── tables ──────────────────────────────────────────────────── */
  const emptyCell = (tag) => h(tag, null, h('br'));
  function tableOp(id, body, cell = cellAt()) {
    if (!cell || !body.contains(cell)) return;
    const tr = cell.parentNode, tbl = cell.closest('table'), col = cell.cellIndex;
    const rows = Array.from(tbl.rows);
    if (id === 'row-below' || id === 'row-above') {
      const row = h('tr', null, Array.from(tr.cells, () => emptyCell('td')));
      if (id === 'row-above' && tr.parentNode.tagName !== 'THEAD') tr.before(row);
      else if (tr.parentNode.tagName === 'THEAD') { let tb = tbl.tBodies[0]; if (!tb) { tb = h('tbody'); tbl.append(tb); } tb.prepend(row); }
      else tr.after(row);
      placeCaret(row.cells[col] || row.cells[0], false);
    } else if (id === 'col-right' || id === 'col-left') {
      if (tr.cells.length >= 30) return;
      for (const r of rows) {
        const ref = r.cells[Math.min(col, r.cells.length - 1)];
        const c = emptyCell(r.parentNode.tagName === 'THEAD' ? 'th' : 'td');
        if (id === 'col-left') ref.before(c); else ref.after(c);
      }
      placeCaret(tr.cells[id === 'col-left' ? col : col + 1], false);
    } else if (id === 'row-del') {
      if (rows.length <= 1) return tableOp('table-del', body, cell);
      const i = rows.indexOf(tr);
      tr.remove();
      if (tbl.tHead && !tbl.tHead.rows.length) tbl.tHead.remove();
      const next = tbl.rows[Math.min(i, tbl.rows.length - 1)];
      placeCaret(next.cells[Math.min(col, next.cells.length - 1)], false);
    } else if (id === 'col-del') {
      if (tr.cells.length <= 1) return tableOp('table-del', body, cell);
      for (const r of rows) if (r.cells[col]) r.cells[col].remove();
      placeCaret(tr.cells[Math.min(col, tr.cells.length - 1)], false);
    } else if (id === 'table-del') {
      const p = h('p', null, h('br'));
      tbl.replaceWith(p);
      placeCaret(p, false);
    }
    commitSoon(body);
  }
  /* Tab and Enter move between cells; past the last cell they add a row */
  function tableKey(e, cell, body) {
    const tbl = cell.closest('table'), cells = Array.from(tbl.querySelectorAll('th,td')), i = cells.indexOf(cell);
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { if (i > 0) placeCaret(cells[i - 1]); return true; }
      if (i < cells.length - 1) { placeCaret(cells[i + 1]); return true; }
      tableOp('row-below', body, cell);
      placeCaret(tbl.rows[tbl.rows.length - 1].cells[0], false);
      return true;
    }
    if (e.key === 'Enter' && modKey(e)) { // leave the table
      e.preventDefault();
      let next = tbl.nextElementSibling;
      if (!next || next.tagName !== 'P') { next = h('p', null, h('br')); tbl.after(next); }
      placeCaret(next, false);
      return true;
    }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); exec('insertLineBreak'); return true; }
    if (e.key === 'Enter') { // the cell below, or a new row
      e.preventDefault();
      const tr = cell.parentNode, rows = Array.from(tbl.rows), below = rows[rows.indexOf(tr) + 1];
      if (below) placeCaret(below.cells[Math.min(cell.cellIndex, below.cells.length - 1)]);
      else tableOp('row-below', body, cell);
      return true;
    }
    // Backspace at the start of a cell stays in the cell instead of merging cells
    if (e.key === 'Backspace' && textBefore(cell) === '' && rng().collapsed) { e.preventDefault(); if (i > 0) placeCaret(cells[i - 1]); return true; }
    return false;
  }

  async function linkCmd() {
    const r = rng(); const saved = r && r.cloneRange();
    const text = saved ? saved.toString() : '';
    const url = await Modal.prompt('Link to', /^https?:/.test(text) ? text : 'https://', { label: 'Insert link' });
    if (!url || !/^(https?:|mailto:)/i.test(url)) return;
    const s = getSelection(); s.removeAllRanges(); if (saved) s.addRange(saved);
    if (text) exec('createLink', url);
    else exec('insertHTML', `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>&nbsp;`);
  }

  /* picker that remembers where the caret was */
  function pickWith(title, load, onPick, extra) {
    const r = rng(); const saved = r && r.cloneRange();
    const rect = caretRect() || { left: innerWidth / 2 - 150, bottom: 120, top: 120 };
    let all = [];
    const restore = () => { const s = getSelection(); s.removeAllRanges(); if (saved) s.addRange(saved); };
    const filter = (q) => {
      q = (q || '').toLowerCase();
      const out = [];
      for (const it of all) { const m = fuzzy(q, it.label.toLowerCase()); if (m) out.push({ ...it, labelHtml: markPositions(it.label, m.p), sc: m.s }); }
      if (q) out.sort((a, b) => b.sc - a.sc);
      return (extra ? [extra] : []).concat(out.slice(0, 200));
    };
    Popup.open({
      x: rect.left, y: rect.bottom, above: rect.top, title, input: true, placeholder: 'Type to filter',
      items: extra ? [extra] : [], empty: 'Nothing here yet',
      onQuery: (q) => Popup.update(filter(q)),
      onPick: (it) => { restore(); onPick(it); },
      onClose: (picked) => { if (!picked) restore(); },
    });
    Promise.resolve(load()).then((list) => { all = list; Popup.update(filter('')); });
  }

  function pickImage() {
    const up = { kind: 'upload', label: 'Upload from computer…', icon: 'plus', hint: Store.hasFolder() ? 'copied into assets/' : 'embedded' };
    pickWith('Insert image', async () => (await Store.listImages()).map((p) => ({ kind: 'file', path: p, label: p, icon: 'image', asImage: true })),
      (it) => {
        if (it.kind === 'upload') return chooseFiles('image/*', async (files) => { for (const f of files) await addImage(f); });
        insertPic(it.path);
      }, up);
  }
  function pickFile() {
    const up = Store.hasFolder() ? { kind: 'upload', label: 'Add a file from computer…', icon: 'plus', hint: 'copied into files/' } : null;
    pickWith('Tag a file', async () => (await Store.listFiles()).map((p) => ({ kind: 'file', path: p, label: p, icon: 'folder' })),
      (it) => {
        if (it.kind === 'upload') return chooseFiles('', async (files) => { for (const f of files) await addFile(f); });
        insertRef(it);
      }, up);
    if (!Store.hasFolder()) toast('Open a vault folder to tag files');
  }
  function pickSecret() {
    pickWith('Reference a secret', () => Store.S.data.secrets.map((x) => ({ kind: 'secret', id: x.id, label: x.key, icon: 'key', hint: x.tags.join(' ') })), insertRef);
  }
  function chooseFiles(accept, cb) {
    const r = rng(); const saved = r && r.cloneRange();
    const inp = h('input', { type: 'file', multiple: true, accept, style: { display: 'none' } });
    inp.onchange = async () => {
      const s = getSelection(); s.removeAllRanges(); if (saved) s.addRange(saved);
      await cb(Array.from(inp.files)); inp.remove();
    };
    document.body.append(inp); inp.click();
  }
  async function addImage(file) {
    const res = await Store.saveImage(file, file.name);
    insertPic(res.path || res.dataUrl);
  }
  async function addFile(file) {
    if (file.type.startsWith('image/')) return addImage(file);
    const path = await Store.importFile(file);
    if (path) { filesCache.at = 0; insertRef({ kind: 'file', path }); }
    else toast('Open a vault folder to attach files', { kind: 'warn' });
  }

  /* The type a tagged file opens with in a new tab. Vault files are the user's own,
     so they open as themselves (HTML renders, SVG and images show, PDFs open);
     the page's no-network policy carries over to them. Files with no known type
     but readable text open as text; anything else the browser downloads. */
  const EXT_TYPES = { html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };
  function openAs(type, path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (EXT_TYPES[ext]) return EXT_TYPES[ext];
    if (/\.(excalidraw|json|md|txt|log|csv|ya?ml|toml|ini|env|js|mjs|ts|tsx|jsx|py|go|rs|rb|java|c|h|cpp|sh|sql|css|xml)$/i.test(path)) return 'text/plain;charset=utf-8';
    return type || 'application/octet-stream';
  }

  /* file tag actions */
  async function fileMenu(chip) {
    const path = chip.dataset.path;
    const r = chip.getBoundingClientRect();
    const f = await Store.fileAt(path);
    if (!f) { toast(`${path} isn't in the vault folder`, { kind: 'warn' }); chip.classList.add('missing'); return; }
    chip.classList.remove('missing');
    const size = f.size < 1024 * 1024 ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB';
    Popup.open({
      x: r.left, y: r.bottom, title: `${path}  ${size}`,
      items: [
        { id: 'open', label: 'Open in a new tab', icon: 'eye' },
        { id: 'save', label: 'Save a copy…', icon: 'down' },
        { id: 'copy', label: 'Copy path', icon: 'copy' },
      ],
      onPick: async (it) => {
        if (it.id === 'copy') { await copyText(path); toast('Copied ' + path); return; }
        const url = URL.createObjectURL(new Blob([f], { type: it.id === 'open' ? openAs(f.type, path) : 'application/octet-stream' }));
        if (it.id === 'open') window.open(url, '_blank', 'noopener');
        else { const a = h('a', { href: url, download: f.name }); document.body.append(a); a.click(); a.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
    });
  }

  /* ── markdown-ish shortcuts on space ─────────────────────────── */
  function autoFormat(body, ctx) {
    const r = rng(); if (!r) return false;
    const block = lineBlock(r.startContainer, body);
    if (!block || !/^(P|DIV|H1|H2|H3)$/.test(block.tagName)) return false;
    const before = textBefore(block).replace(/ /g, ' ');
    const m = /^(#{1,3}|[-*+]|1[.)]|\[ ?\]|\[x\]|>|```([\w+#-]*)|---) $/i.exec(before);
    if (!m) return false;
    // remove the typed prefix
    const x = document.createRange();
    x.selectNodeContents(block); x.setEnd(r.startContainer, r.startOffset);
    const s = getSelection(); s.removeAllRanges(); s.addRange(x);
    exec('delete');
    const p = m[1];
    if (p[0] === '#') command('h' + p.length, body, ctx);
    else if (/^[-*+]$/.test(p)) command('ul', body, ctx);
    else if (/^1/.test(p)) command('ol', body, ctx);
    else if (/^\[x\]$/i.test(p)) command('todo', body, ctx, 'x');
    else if (p[0] === '[') command('todo', body, ctx);
    else if (p === '>') command('quote', body, ctx);
    else if (p === '---') command('hr', body, ctx);
    else command('code', body, ctx, m[2] || '');
    return true;
  }
  /* `inline code` when the closing backtick is typed */
  function autoInlineCode() {
    const r = rng(); if (!r || r.startContainer.nodeType !== 3) return;
    const n = r.startContainer, o = r.startOffset;
    const before = n.data.slice(0, o);
    const m = /`([^`\n]+)`$/.exec(before);
    if (!m || n.parentNode.closest('code,pre')) return;
    selectBetween(n, o - m[0].length, n, o);
    exec('insertHTML', `<code>${esc(m[1])}</code>​`);
  }

  /* ── attach behaviour to a note body ─────────────────────────── */
  const commits = new WeakMap();
  function commitSoon(body) { const c = commits.get(body); if (c) c(); }

  function attach(body, ctx) {
    // ctx: { note, onCommit(serialized) }
    const commit = debounce(() => ctx.onCommit(serialize(body)), 280);
    commits.set(body, commit);

    body.addEventListener('keydown', (e) => {
      if (isAltGr(e)) return; // AltGr types characters (@, €, …) on Windows/Linux layouts
      if (Popup.isOpen() && trig && Popup.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
      const r = rng();
      const pre = r && r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('pre.code');
      if (pre && body.contains(pre)) {
        const code = ensureCode(pre);
        if (modKey(e) && e.key.toLowerCase() === 'z') { e.preventDefault(); codeUndo(code, e.shiftKey ? 1 : -1); commit(); return; }
        if (modKey(e) && e.key.toLowerCase() === 'y') { e.preventDefault(); codeUndo(code, 1); commit(); return; }
        if (e.key === 'Enter' && (modKey(e) || e.shiftKey)) { e.preventDefault(); exitCode(pre, code); commit(); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          const [a] = getOff(code);
          const t = code.textContent;
          const lineStart = t.lastIndexOf('\n', a - 1) + 1;
          const line = t.slice(lineStart, a);
          const rest = t.slice(a).replace(/\n$/, '');
          if (!line.trim() && !rest && t.slice(0, lineStart).endsWith('\n\n')) { exitCode(pre, code); commit(); return; }
          let ind = (/^[ \t]*/.exec(line) || [''])[0];
          if (/[{[(:]\s*$/.test(line)) ind += '  ';
          codeInsert(code, '\n' + ind); commit(); return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const [a, b] = getOff(code);
          const t = code.textContent;
          const ls = t.lastIndexOf('\n', a - 1) + 1;
          if (e.shiftKey || a !== b) {
            const le = b;
            const seg = t.slice(ls, le);
            const lines = seg.split('\n');
            const out = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l)).join('\n');
            paint(code, t.slice(0, ls) + out + t.slice(le), null);
            setOff(code, ls, ls + out.length);
            snap(code, true);
          } else codeInsert(code, '  ');
          commit(); return;
        }
        if (e.key === 'Backspace' && !code.textContent.replace(/\n/g, '')) {
          e.preventDefault();
          const p = h('p', null, h('br'));
          pre.replaceWith(p); placeCaret(p, false); commit(); return;
        }
        if (e.key === 'Escape') { e.preventDefault(); body.blur(); return; }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); if (Popup.isOpen()) Popup.close(); else body.blur(); return; }
      const cell = r && cellAt();
      if (cell && body.contains(cell) && tableKey(e, cell, body)) { commit(); return; }
      if (modKey(e) && !e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); toggleInlineCode(); commit(); return; }
      if (modKey(e) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); exec('strikeThrough'); commit(); return; }
      if (modKey(e) && (isMac ? e.altKey : e.shiftKey && !e.altKey) && /^Digit[0-3]$/.test(e.code)) {
        e.preventDefault(); const d = e.code.slice(-1); command(d === '0' ? 'p' : 'h' + d, body, ctx); return;
      }
      if (e.key === 'Tab' && r) {
        const li = lineBlock(r.startContainer, body);
        if (li && li.tagName === 'LI') { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); commit(); return; }
      }
      // Enter on an empty quote line leaves the quote, like an empty list item leaves the list
      if (e.key === 'Enter' && !e.shiftKey && r && r.collapsed) {
        const b = lineBlock(r.startContainer, body);
        if (b && b.tagName === 'BLOCKQUOTE' && !b.textContent.replace(/[\s\u200b]/g, '')) { e.preventDefault(); exec('formatBlock', 'p'); commit(); return; }
      }
      if (e.key === 'Backspace' && r && r.collapsed) {
        const b = lineBlock(r.startContainer, body);
        if (b && /^(H1|H2|H3|BLOCKQUOTE)$/.test(b.tagName) && textBefore(b) === '') { e.preventDefault(); exec('formatBlock', 'p'); commit(); return; }
      }
    });

    body.addEventListener('input', (e) => {
      const r = rng();
      const node = r && r.startContainer;
      const pre = node && (node.nodeType === 1 ? node : node.parentNode).closest('pre.code');
      if (pre && body.contains(pre) && !e.isComposing) {
        const code = ensureCode(pre);
        rehl(code); snap(code);
      } else if (e.inputType === 'insertText' && !e.isComposing) {
        // run after the input event so our own execCommand calls never nest
        const d = e.data;
        queueMicrotask(() => {
          if (d === ' ' && !trig) autoFormat(body, ctx);
          else if (d === '`') autoInlineCode();
          else if ((d === '/' || d === '@') && !trig) startTrigger(d, body, ctx);
          if (trig) updateTrigger();
          commit();
        });
      } else if (e.inputType === 'insertParagraph' && r) {
        // fresh todo items start unchecked
        const li = lineBlock(r.startContainer, body);
        if (li && li.tagName === 'LI' && li.parentNode.getAttribute('data-type') === 'todo') li.setAttribute('data-checked', 'false');
        const b = lineBlock(r.startContainer, body);
        if (!b && body.textContent.trim()) exec('formatBlock', 'p');
      }
      if (trig) updateTrigger();
      if (!body.firstElementChild) { exec('formatBlock', 'p'); }
      fixNesting(body);
      followCaret();
      commit();
    });

    body.addEventListener('paste', async (e) => {
      const dt = e.clipboardData; if (!dt) return;
      const files = Array.from(dt.files || []);
      const r = rng();
      const node = r && r.startContainer;
      const pre = node && (node.nodeType === 1 ? node : node.parentNode).closest('pre.code');
      if (files.length && !pre) {
        e.preventDefault();
        for (const f of files) await addFile(f);
        commit(); return;
      }
      const text = dt.getData('text/plain');
      if (pre) { e.preventDefault(); codeInsert(ensureCode(pre), text.replace(/\r\n?/g, '\n')); commit(); return; }
      if (r && !r.collapsed && /^https?:\/\/\S+$/.test(text.trim())) { e.preventDefault(); exec('createLink', text.trim()); commit(); return; }
      const html = dt.getData('text/html');
      e.preventDefault();
      if (html) {
        const frag = sanitize(html);
        const tmp = h('div'); tmp.append(frag);
        exec('insertHTML', tmp.innerHTML);
        hydrate(body);
      } else exec('insertText', text);
      commit();
    });

    body.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.stopPropagation(); body.classList.add('drop'); } });
    body.addEventListener('dragleave', () => body.classList.remove('drop'));
    body.addEventListener('drop', async (e) => {
      body.classList.remove('drop');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      body.contentEditable = 'true';
      body.focus();
      const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (pos && body.contains(pos.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); }
      for (const f of files) await addFile(f);
      commit();
    });

    body.addEventListener('click', (e) => {
      const m = e.target.closest('a.mention');
      if (m) { e.preventDefault(); if (Store.noteRef(m.dataset.note)) bus.emit('goto-note', m.dataset.note); else toast('That note was deleted'); return; }
      const br = e.target.closest('a.bref');
      if (br) { e.preventDefault(); if (Store.board(br.dataset.board)) bus.emit('goto-board', br.dataset.board); else toast('That board was deleted'); return; }
      const sr = e.target.closest('span.sref');
      if (sr) { e.preventDefault(); const x = Store.secret(sr.dataset.secret); if (x) copyText(x.value).then(() => toast(`Copied ${x.key}`)); return; }
      const fr = e.target.closest('span.fref');
      if (fr) { e.preventDefault(); fileMenu(fr); return; }
      const a = e.target.closest('a[href]');
      if (a && (modKey(e) || !body.matches(':focus'))) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
      const li = e.target.closest('li');
      if (li && li === e.target && li.parentNode.getAttribute('data-type') === 'todo') {
        const lr = li.getBoundingClientRect();
        if (e.clientX - lr.left < 22 * Board.zoom()) {
          e.preventDefault();
          li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
          commit();
        }
      }
      const pre = e.target === e.target.closest('pre.code') ? e.target : null;
      if (pre) {
        const pr = pre.getBoundingClientRect(), z = Board.zoom();
        if (e.clientY - pr.top < 22 * z && pr.right - e.clientX < 90 * z) codeMenu(pre, commit);
      }
    });

    body.addEventListener('focus', () => { followCaret(); });
    body.addEventListener('blur', () => { commit.flush(); if (trig) Popup.close(); });
    body.addEventListener('keyup', followCaret);
    // pic resize dispatches input on the figure
    body.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('figure.pic')) commit(); });
  }

  function followCaret() {
    const r = caretRect();
    if (r && r.width + r.height > 0) Bird.look(r.left, r.top + r.height / 2);
  }

  function toggleInlineCode() {
    const r = rng(); if (!r) return;
    const c = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('code');
    if (c && !c.closest('pre')) { const t = c.textContent; c.replaceWith(document.createTextNode(t)); return; }
    if (r.collapsed) { exec('insertHTML', '<code>​</code>'); return; }
    exec('insertHTML', `<code>${esc(r.toString())}</code>`);
  }

  function codeMenu(pre, commit) {
    const r = pre.getBoundingClientRect();
    const code = ensureCode(pre);
    const items = [{ id: 'copy', label: 'Copy code', icon: 'copy' }, { id: 'auto', label: 'Detect language', icon: 'cmd', hint: pre.getAttribute('data-auto') || '' }]
      .concat(HL.LANGS.map((l) => ({ id: 'lang', lang: l, label: l, icon: 'cmd' })));
    Popup.open({
      x: r.right - 200, y: r.top + 22, title: 'Code block', input: true, placeholder: 'Language',
      items,
      onQuery: (q) => Popup.update(q ? items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())).concat(/^[\w+#-]+$/.test(q) && !HL.LANGS.includes(q) ? [{ id: 'lang', lang: q, label: `Use “${q}”`, icon: 'cmd' }] : []) : items),
      onPick: (it) => {
        if (it.id === 'copy') { copyText(code.textContent.replace(/\n$/, '')).then(() => toast('Copied code')); return; }
        if (it.id === 'auto') pre.removeAttribute('data-lang'); else pre.setAttribute('data-lang', it.lang);
        paint(code, code.textContent, null);
        commit();
      },
    });
  }

  /* create the body element for a note */
  function mount(note, onCommit) {
    const body = h('div', { class: 'note-body', contenteditable: 'false', spellcheck: 'false', 'data-gramm': 'false' });
    body.append(sanitize(note.html));
    hydrate(body);
    attach(body, { note, onCommit });
    return body;
  }

  const refit = (root) => { for (const f of root.querySelectorAll('figure.pic')) { sizePic(f); fitPic(f); } };

  /* push the focused note's pending edit to the store now (before the tab closes or hides) */
  function flush() {
    const a = document.activeElement;
    const body = a && a.closest && a.closest('.note-body');
    const c = body && commits.get(body);
    if (c) c.flush();
  }

  return { refit, mount, sanitize, derive, refreshChips, openAs, flush };
})();
