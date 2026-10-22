import { clamp, now } from './00-util.js';
import MARK from '../brand/mark.json';

/* ── the frogmouth (the bird) ────────────────────────────────────────────────
   The symbol (a head-on tawny frogmouth) and the wordmark, whose two o's
   are the same amber eyes.
   Eyes follow the pointer (or the text caret while typing), blink,
   squint when idle (frogmouths camouflage by narrowing their eyes) and
   shut tight while a secret or passphrase is being typed. */
export const Bird = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const eyes = new Set();
  const heads = new Set();
  const LID = { wide: 0.0, rest: 0.2, squint: 0.6, sleepy: 0.84, closed: 1.06 };
  let px = innerWidth / 2, py = innerHeight / 3, focusPt = null, focusT = 0;
  let mood = 'rest', lastAct = now(), raf = 0, clipN = 0, blinking = false;

  const s = (tag, attrs = {}, kids = []) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    kids.forEach((k) => el.append(k));
    return el;
  };

  let ctx;
  function measure(text, size) {
    ctx = ctx || document.createElement('canvas').getContext('2d');
    ctx.font = `800 ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  }

  /* One amber eye. slant 0: a level lid; slant -1 / 1: the brand's heavy lid,
     higher at the outer edge and lower toward the beak (left / right eye).
     Lids move by translateY, so blinking and squinting work the same for both. */
  function eye(cx, cy, r, svg, slant = 0) {
    const id = 'fmeye' + ++clipN;
    const pupil = s('g', { class: 'fm-pupil' }, [
      s('circle', { r: r * 0.47, class: 'fm-pup' }),
      s('circle', { r: r * 0.15, cx: -r * 0.17, cy: -r * 0.2, class: 'fm-glint' }),
    ]);
    let lidD, edgeD;
    if (slant) {
      // rest position (see setLid) puts this edge at -0.55r outside and +0.1r inside
      const k = 0.936, out = (-0.55 + k) * r, inn = (0.1 + k) * r, w = r * 1.4;
      const yl = slant < 0 ? out : inn, yr = slant < 0 ? inn : out, mid = (yl + yr) / 2 + r * 0.1;
      lidD = `M${-w} ${-r * 3}H${w}V${yr}Q0 ${mid} ${-w} ${yl}Z`;
      edgeD = `M${-w} ${yl}Q0 ${mid} ${w} ${yr}`;
    } else {
      lidD = `M${-r * 1.3} ${-r * 2.6}H${r * 1.3}V0Q0 ${r * 0.42} ${-r * 1.3} 0Z`;
      edgeD = `M${-r * 1.3} 0Q0 ${r * 0.42} ${r * 1.3} 0`;
    }
    const lidG = s('g', { class: 'fm-lidg' }, [s('path', { class: 'fm-lid', d: lidD }), s('path', { class: 'fm-lid-edge', d: edgeD, fill: 'none' })]);
    const ring = s('circle', { r, class: 'fm-ring' });
    const g = s('g', { class: 'fm-eye', transform: `translate(${cx} ${cy})` }, [
      s('clipPath', { id }, [s('circle', { r: r - 0.5 })]),
      s('circle', { r, class: 'fm-iris' }),
      s('circle', { r: r * 0.78, class: 'fm-iris-in' }),
      s('g', { 'clip-path': `url(#${id})` }, [pupil, lidG]),
      ring,
    ]);
    const e = { g, pupil, lid: lidG, ring, r, svg };
    eyes.add(e);
    setLid(e, LID.closed);
    return e;
  }

  function setLid(e, amt) {
    e.lid.style.transform = `translateY(${((-1.42 + amt * 2.42) * e.r).toFixed(2)}px)`;
  }

  /* Build an SVG.
     'mark': the frogmouth symbol (src/brand/mark.json) with live eyes.
     'word': the wordmark "frogmouth", its two o's the same lidded eyes. */
  function make(kind = 'word') {
    const svg = s('svg', { class: 'fm fm-' + kind, role: 'img', 'aria-label': 'frogmouth' });
    const head = s('g', { class: 'fm-head' });
    let es;
    if (kind === 'mark') {
      const C = MARK.colors;
      const layer = (l) => s('path', l.stroke
        ? { d: l.d, fill: 'none', stroke: C[l.stroke], 'stroke-width': l.width, 'stroke-linecap': 'round' }
        : { d: l.d, fill: C[l.fill], ...(l.opacity ? { opacity: l.opacity } : {}) });
      MARK.back.forEach((l) => head.append(layer(l)));
      es = MARK.eyes.map((e) => eye(e.cx, e.cy, e.r, svg, e.slant));
      es.forEach((e) => head.append(e.g));
      MARK.front.forEach((l) => head.append(layer(l)));
      svg.setAttribute('viewBox', MARK.viewBox.join(' '));
      head.style.transformOrigin = '64px 104px';
      heads.add({ svg, head });
    } else {
      const R = 26, E = 100, pad = 9;
      const gmW = measure('gm', 100);
      const fs = (2 * (E - R - pad)) / gmW * 100;
      const frW = measure('fr', fs), uthW = measure('uth', fs);
      const base = fs * 0.27; // baseline so the x-height centres on the eyes
      const leftX = -E - R - pad, rightX = E + R + pad;
      const txt = (t, x, anchor) => {
        const el = s('text', { x, y: base, 'text-anchor': anchor, 'font-size': fs.toFixed(1), 'font-family': FONT });
        el.textContent = t;
        return el;
      };
      head.append(s('g', { class: 'fm-word' }, [txt('fr', leftX, 'end'), txt('gm', 0, 'middle'), txt('uth', rightX, 'start')]));
      es = [eye(-E, 0, R, svg, -1), eye(E, 0, R, svg, 1)];
      es.forEach((e) => head.append(e.g));
      const minX = leftX - frW - 4, maxX = rightX + uthW + 4, minY = -R - 6, maxY = base + fs * 0.26;
      svg.setAttribute('viewBox', `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`);
    }
    svg.append(head);
    svg.addEventListener('click', () => startle(svg));
    // wake up: eyes open once, a moment after appearing
    setTimeout(() => es.forEach((e) => setLid(e, lidAmt())), kind === 'mark' ? 450 : 250);
    schedule();
    return svg;
  }

  const isShy = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('[data-shy]')); };
  function lidAmt() { return isShy() ? LID.closed : LID[mood]; }
  function applyLids() { for (const e of eyes) setLid(e, lidAmt()); }

  function setMood(m) {
    if (mood === m) return;
    mood = m;
    if (!blinking) applyLids();
  }

  function blink(twice) {
    if (isShy() || blinking || mood === 'sleepy') return;
    blinking = true;
    for (const e of eyes) { e.lid.classList.add('fast'); setLid(e, LID.closed); }
    setTimeout(() => {
      applyLids();
      setTimeout(() => {
        for (const e of eyes) e.lid.classList.remove('fast');
        blinking = false;
        if (twice) setTimeout(() => blink(false), 140);
      }, 120);
    }, 110);
  }

  function startle(svg) {
    activity();
    svg.classList.remove('ruffle'); void svg.getBoundingClientRect(); svg.classList.add('ruffle');
    setMood('wide');
    clearTimeout(startle.t);
    startle.t = setTimeout(() => setMood('rest'), 900);
  }

  function activity() {
    lastAct = now();
    if (mood === 'squint' || mood === 'sleepy') { setMood('rest'); blink(true); }
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    const useFocus = focusPt && now() - focusT < 2500;
    const tx = useFocus ? focusPt.x : px, ty = useFocus ? focusPt.y : py;
    for (const e of eyes) {
      if (!e.svg.isConnected) { eyes.delete(e); continue; }
      const b = e.ring.getBoundingClientRect();
      if (!b.width) continue;
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / (b.width * 2.5));
      const off = e.r * 0.4 * k;
      e.pupil.style.transform = `translate(${((dx / d) * off).toFixed(2)}px,${((dy / d) * off).toFixed(2)}px)`;
    }
    for (const hd of heads) {
      if (!hd.svg.isConnected) { heads.delete(hd); continue; }
      const b = hd.svg.getBoundingClientRect();
      if (!b.width) continue;
      const dx = tx - (b.left + b.width / 2);
      hd.head.style.transform = `rotate(${clamp(dx / 120, -4, 4).toFixed(2)}deg)`;
    }
  }

  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; focusPt = null; activity(); schedule(); }, { passive: true });
  addEventListener('keydown', () => activity(), true);
  document.addEventListener('pointerleave', () => { px = innerWidth / 2; py = innerHeight / 2; schedule(); });

  // shut eyes while secrets are being typed
  const reshy = () => setTimeout(() => { if (!blinking) applyLids(); }, 0);
  document.addEventListener('focusin', reshy);
  document.addEventListener('focusout', reshy);

  // idle → squint → sleepy; random blinks while awake
  setInterval(() => {
    const idle = now() - lastAct;
    if (idle > 120000) setMood('sleepy');
    else if (idle > 30000) setMood('squint');
  }, 2000);
  (function loop() {
    setTimeout(() => { if (!document.hidden) blink(Math.random() < 0.18); loop(); }, 2600 + Math.random() * 4800);
  })();

  return {
    make,
    blink,
    look(x, y) { focusPt = { x, y }; focusT = now(); schedule(); },
    mood: setMood,
    activity,
  };
})();
