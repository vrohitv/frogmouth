import { esc, download, toast } from './00-util.js';
import { Store } from './03-store.js';
import { Board } from './07-board.js';
import { Draw } from './07c-draw.js';

/* ── export: a board as a picture (SVG or PNG), notes as Markdown ─────
   Pictures are drawn from the data, not screenshotted: notes are paper cards with their
   text, shapes and lines as they are on the board, in the current theme's colours. No
   fonts are embedded; text uses the system's monospace font, so it wraps the same anywhere. */
export const Export = (() => {
  const PAD = 40, SIZE = 13, LINE = 19, CH = SIZE * 0.6, MONO = 'ui-monospace, Menlo, Consolas, monospace';

  /* a paper colour's fill and ink in the current theme */
  function paper(color) {
    const probe = document.createElement('div');
    probe.className = 'note paper-' + (color || 'moth');
    probe.style.display = 'none';
    document.body.append(probe);
    const cs = getComputedStyle(probe), out = { fill: cs.getPropertyValue('--paper').trim() || '#888', ink: cs.getPropertyValue('--ink').trim() || '#111', rule: cs.getPropertyValue('--rule').trim() || 'rgba(0,0,0,.15)' };
    probe.remove();
    return out;
  }
  const wrap = (text, width) => {
    const max = Math.max(4, Math.floor(width / CH)), out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        if ((line + word).length > max && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line += word;
        while (line.length > max) { out.push(line.slice(0, max)); line = line.slice(max); }
      }
      out.push(line);
    }
    return out;
  };
  /* a note's blocks as lines of text: headings and the title bold, list items with a bullet */
  function noteLines(html) {
    const t = document.createElement('template'); t.innerHTML = html;
    const out = [];
    const walk = (el, depth) => {
      for (const b of el.children) {
        const tag = b.tagName.toLowerCase(), pad = '  '.repeat(depth);
        if (tag === 'ul' || tag === 'ol') {
          let i = 1;
          for (const li of b.children) {
            const own = [...li.childNodes].filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join('');
            const mark = b.dataset.type === 'todo' ? (li.dataset.checked === 'true' ? '☑ ' : '☐ ') : tag === 'ol' ? `${i++}. ` : '• ';
            out.push({ text: pad + mark + own });
            for (const sub of li.children) if (/^(UL|OL)$/.test(sub.tagName)) walk({ children: [sub] }, depth + 1);
          }
        } else if (tag === 'pre') out.push(...b.textContent.replace(/\n$/, '').split('\n').map((l) => ({ text: pad + l, code: true })));
        else if (tag === 'hr') out.push({ text: '' });
        else if (tag === 'figure') out.push({ text: '[image]' });
        else if (tag === 'table') for (const tr of b.querySelectorAll('tr')) out.push({ text: [...tr.children].map((c) => c.textContent).join(' | ') });
        else out.push({ text: pad + b.textContent, bold: /^h[1-3]$/.test(tag) });
      }
    };
    walk(t.content, 0);
    if (out.length) out[0].bold = true; // the first line is the title
    return out;
  }

  /* the board as an SVG document; returns { svg, w, h } */
  function svg(b = Board.current()) {
    const rects = [], parts = [];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const grow = (x, y, w, h) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); };
    const items = b.items.map((it) => ({ it, n: Store.noteRef(it.note) && Store.noteRef(it.note).note, r: Board.rectOf(it.note) || { x: it.x, y: it.y, w: it.w, h: it.h || 160 } })).filter((x) => x.n);
    const shapes = Store.shapes(b);
    for (const { r } of items) grow(r.x, r.y, r.w, r.h);
    for (const x of shapes) if (x.type !== 'line' && Number.isFinite(x.w)) grow(x.x, x.y - (x.type === 'frame' ? 22 : 0), x.w, x.h + (x.type === 'frame' ? 22 : 0));
    const paths = shapes.filter((x) => x.type === 'line').map((x) => ({ x, pts: Draw.points(x) })).filter((l) => l.pts.length);
    for (const { pts } of paths) for (const p of pts) grow(p.x, p.y, 0, 0);
    if (x1 === Infinity) { x1 = y1 = 0; x2 = y2 = 1; }
    const W = Math.ceil(x2 - x1 + PAD * 2), H = Math.ceil(y2 - y1 + PAD * 2), ox = PAD - x1, oy = PAD - y1;
    const root = getComputedStyle(document.documentElement), bg = root.getPropertyValue('--bg').trim() || '#fff', line = root.getPropertyValue('--text').trim() || '#333';
    // leading and repeated spaces as no-break spaces: every viewer keeps those, so code stays indented
    const keep = (t) => t.replace(/^ +| {2,}/g, (m) => '\u00a0'.repeat(m.length));
    const text = (x, y, s, fill, extra = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}"${extra}>${esc(keep(s))}</text>`;
    // frames under everything, then boxes and notes in their stacking order, lines on top
    for (const f of shapes.filter((x) => x.type === 'frame')) {
      const c = paper(f.color);
      parts.push(`<rect x="${f.x + ox}" y="${f.y + oy}" width="${f.w}" height="${f.h}" rx="4" fill="none" stroke="${c.fill}" stroke-width="2"${f.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
      if (f.text) parts.push(text(f.x + ox, f.y + oy - 8, f.text, line, ' font-weight="700"'));
    }
    const stack = [...items.map((x) => ({ z: x.it.z || 1, note: x })), ...shapes.filter((x) => Store.BOXES.includes(x.type)).map((x) => ({ z: x.z || 1, box: x }))].sort((a, b) => a.z - b.z);
    for (const s of stack) {
      if (s.note) {
        const { n, r } = s.note, c = paper(n.color), X = r.x + ox, Y = r.y + oy;
        parts.push(`<rect x="${X}" y="${Y}" width="${r.w}" height="${r.h}" rx="6" fill="${c.fill}"/>`);
        let y = Y + 28;
        for (const l of noteLines(n.html)) {
          for (const w of wrap(l.text, r.w - 28)) {
            if (y > Y + r.h - 8) break;
            parts.push(text(X + 14, y, w, c.ink, (l.bold ? ' font-weight="700"' : '') + (l.code ? ' opacity=".85"' : '')));
            y += LINE;
          }
        }
      } else {
        const x = s.box, c = paper(x.color), X = x.x + ox, Y = x.y + oy, fill = x.fill === false || x.type === 'text' ? 'none' : c.fill;
        const stroke = x.type === 'text' ? 'none' : line, dash = x.dash ? ' stroke-dasharray="6 4"' : '';
        if (x.type === 'ellipse') parts.push(`<ellipse cx="${X + x.w / 2}" cy="${Y + x.h / 2}" rx="${x.w / 2}" ry="${x.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>`);
        else if (x.type === 'diamond') parts.push(`<polygon points="${X + x.w / 2},${Y} ${X + x.w},${Y + x.h / 2} ${X + x.w / 2},${Y + x.h} ${X},${Y + x.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>`);
        else parts.push(`<rect x="${X}" y="${Y}" width="${x.w}" height="${x.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>`);
        const ls = wrap(x.text || '', x.w - 16);
        let y = Y + x.h / 2 - ((ls.length - 1) * LINE) / 2 + SIZE / 3;
        for (const w of ls) { parts.push(text(X + x.w / 2, y, w, x.fill === false || x.type === 'text' ? line : c.ink, ' text-anchor="middle"')); y += LINE; }
      }
    }
    for (const { x, pts } of paths) {
      const c = paper(x.color), stroke = x.color && x.color !== 'moth' ? c.fill : line;
      const n = pts.length, ends = pts.map((p) => ({ x: p.x + ox, y: p.y + oy }));
      const he = x.head === 'end' || x.head === 'both', hb = x.head === 'both';
      const body = ends.slice();
      if (he) body[n - 1] = Draw.shorten(ends[n - 1], ends[n - 2], 7);
      if (hb) body[0] = Draw.shorten(ends[0], ends[1], 7);
      parts.push(`<path d="${body.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')}" fill="none" stroke="${stroke}" stroke-width="1.5"${x.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
      if (he) parts.push(`<path d="${Draw.head(ends[n - 1], ends[n - 2])}" fill="${stroke}"/>`);
      if (hb) parts.push(`<path d="${Draw.head(ends[0], ends[1])}" fill="${stroke}"/>`);
      if (x.text) {
        const m = n === 4 ? { x: (ends[1].x + ends[2].x) / 2, y: (ends[1].y + ends[2].y) / 2 } : { x: (ends[0].x + ends[n - 1].x) / 2, y: (ends[0].y + ends[n - 1].y) / 2 };
        const w = x.text.length * CH + 12;
        parts.push(`<rect x="${m.x - w / 2}" y="${m.y - 11}" width="${w}" height="20" rx="4" fill="${bg}"/>`, text(m.x, m.y + 4, x.text, line, ' text-anchor="middle"'));
      }
    }
    rects.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
    const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${MONO}" font-size="${SIZE}">\n${rects.join('')}\n${parts.join('\n')}\n</svg>\n`;
    return { svg: out, w: W, h: H };
  }

  /* the same picture as a PNG, at twice the size where it fits a canvas */
  function png(b = Board.current()) {
    const { svg: s, w, h } = svg(b);
    const scale = Math.min(2, 8192 / Math.max(w, h));
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the picture'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the picture')); };
      img.src = url;
    });
  }

  const fileName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
  const day = () => new Date().toISOString().slice(0, 10);
  async function saveBoard(kind) {
    const b = Board.current(); if (!b) return;
    try {
      if (kind === 'svg') download(`${fileName(b.name)}-${day()}.svg`, svg(b).svg, 'image/svg+xml');
      else download(`${fileName(b.name)}-${day()}.png`, await png(b), 'image/png');
      toast(`Exported ${b.name} as ${kind.toUpperCase()}`);
    } catch (err) { toast(err.message, { kind: 'warn' }); }
  }

  /* ── Markdown ── */
  /* names: note id -> its file name without .md, unique; up: path from the file to the vault folder */
  function markdown(html, names = new Map(), up = '') {
    const t = document.createElement('template'); t.innerHTML = html;
    const inline = (node) => [...node.childNodes].map((n) => {
      if (n.nodeType === 3) return n.data;
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase(), inner = inline(n);
      if (tag === 'b' || tag === 'strong') return inner.trim() ? `**${inner}**` : inner;
      if (tag === 'i' || tag === 'em') return inner.trim() ? `*${inner}*` : inner;
      if (tag === 's' || tag === 'del') return `~~${inner}~~`;
      if (tag === 'mark') return `==${inner}==`;
      if (tag === 'code') return '`' + n.textContent + '`';
      if (tag === 'br') return '\n';
      if (tag === 'a' && n.classList.contains('mention')) return names.has(n.dataset.note) ? `[[${names.get(n.dataset.note)}]]` : inner.replace(/^@/, '');
      if (tag === 'a' && n.classList.contains('bref')) return inner.replace(/^@+/, '');
      if (tag === 'a' && n.getAttribute('href')) return `[${inner}](${n.getAttribute('href')})`;
      if (tag === 'span' && n.classList.contains('fref')) return `[${n.textContent}](${up}${encodeURI(n.dataset.path || '')})`;
      if (tag === 'span' && n.classList.contains('sref')) return '`' + n.textContent + '`';
      return inner;
    }).join('');
    const out = [];
    const list = (el, depth) => {
      let i = 1;
      for (const li of el.children) {
        const nested = [...li.children].filter((c) => /^(UL|OL)$/.test(c.tagName));
        const own = li.cloneNode(true); for (const c of [...own.children]) if (/^(UL|OL)$/.test(c.tagName)) c.remove();
        const mark = el.dataset.type === 'todo' ? (li.dataset.checked === 'true' ? '- [x] ' : '- [ ] ') : el.tagName === 'OL' ? `${i++}. ` : '- ';
        out.push('  '.repeat(depth) + mark + inline(own).trim());
        for (const c of nested) list(c, depth + 1);
      }
    };
    for (const b of t.content.children) {
      const tag = b.tagName.toLowerCase();
      if (/^h[1-3]$/.test(tag)) out.push('#'.repeat(+tag[1]) + ' ' + inline(b).trim(), '');
      else if (tag === 'ul' || tag === 'ol') { list(b, 0); out.push(''); }
      else if (tag === 'pre') out.push('```' + (b.dataset.lang || ''), b.textContent.replace(/\n$/, ''), '```', '');
      else if (tag === 'blockquote') out.push(...inline(b).trim().split('\n').map((l) => '> ' + l), '');
      else if (tag === 'hr') out.push('---', '');
      else if (tag === 'figure') { const src = b.dataset.src || ''; out.push(`![](${/^data:/.test(src) ? src : up + encodeURI(src)})`, ''); }
      else if (tag === 'table') {
        const rows = [...b.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inline(c).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()));
        if (rows.length) { out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join('')); for (const r of rows.slice(1)) out.push('| ' + r.join(' | ') + ' |'); out.push(''); }
      } else out.push(inline(b), '');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  /* every note as Markdown: one file per note in markdown/<date time>/ of the vault folder
     (links between notes become [[links]]), or one downloaded file without a folder */
  async function saveNotes() {
    const notes = Store.S.data.notes;
    if (!notes.length) { toast('There are no notes to export'); return; }
    const names = new Map(), used = new Set();
    for (const n of notes) {
      let base = fileName(n.title), k = 2, name = base;
      while (used.has(name.toLowerCase())) name = `${base} (${k++})`;
      used.add(name.toLowerCase()); names.set(n.id, name);
    }
    try {
      if (Store.hasFolder()) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
        const top = await Store.S.vault.dir.getDirectoryHandle('markdown', { create: true });
        const dir = await top.getDirectoryHandle(stamp, { create: true });
        for (const n of notes) {
          const w = await (await dir.getFileHandle(names.get(n.id) + '.md', { create: true })).createWritable();
          await w.write(markdown(n.html, names, '../../')); await w.close();
        }
        toast(`Exported ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} to markdown/${stamp}`);
        return `markdown/${stamp}`;
      }
      download(`frogmouth-notes-${day()}.md`, notes.map((n) => markdown(n.html, names)).join('\n---\n\n'), 'text/markdown');
      toast(`Exported ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} as one Markdown file`);
    } catch (err) { toast(err.message || 'Could not export', { kind: 'warn' }); }
    return null;
  }

  return { svg, png, markdown, saveBoard, saveNotes };
})();
