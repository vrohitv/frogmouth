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

  return { anchor, route, KINDS, GAP };
})();
