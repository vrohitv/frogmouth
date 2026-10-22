import { clamp, now } from './00-util.js';
import MARK from '../brand/mark.json';

/* ── the frogmouth (the bird) ────────────────────────────────────────────────
   The symbol (a head-on tawny frogmouth) and the wordmark, whose two o's
   are the same sage eyes.
   Eyes follow the pointer (or the text caret while typing), blink,
   squint when idle (frogmouths camouflage by narrowing their eyes), fall
   asleep after a while (eyes shut, slow breaths, drifting z's) and shut
   tight while a secret is being typed. */
export const Bird = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const eyes = new Set();
  const heads = new Set();
  const svgs = new Set();
  const LID = { wide: 0.0, rest: 0.2, squint: 0.45, sleepy: 0.8, asleep: 1.06, closed: 1.06 };
  const DOZE = 30e3, SLEEPY = 75e3, ASLEEP = 120e3; // idle times for each stage
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

  /* One sage eye. heavy: the brand's calm lid, level and gently drooping
     (never angled toward the beak, which reads as anger); otherwise a light lid.
     Lids move by translateY, so blinking and squinting work the same for both. */
  function eye(cx, cy, r, svg, heavy = true) {
    const id = 'fmeye' + ++clipN;
    const pupil = s('g', { class: 'fm-pupil' }, [
      s('circle', { r: r * 0.47, cy: heavy ? r * 0.15 : 0, class: 'fm-pup' }),
      s('circle', { r: r * 0.15, cx: -r * 0.17, cy: heavy ? -r * 0.05 : -r * 0.2, class: 'fm-glint' }),
    ]);
    let lidD, edgeD;
    if (heavy) {
      // at rest (see setLid) the edge sits at -0.42r at the sides, drooping to about -0.17r mid-eye
      const k = 0.936, side = (-0.42 + k) * r, ctrl = (0.08 + k) * r, w = r * 1.4;
      lidD = `M${-w} ${-r * 3}H${w}V${side}Q0 ${ctrl} ${-w} ${side}Z`;
      edgeD = `M${-w} ${side}Q0 ${ctrl} ${w} ${side}`;
    } else {
      lidD = `M${-r * 1.3} ${-r * 2.6}H${r * 1.3}V0Q0 ${r * 0.42} ${-r * 1.3} 0Z`;
      edgeD = `M${-r * 1.3} 0Q0 ${r * 0.42} ${r * 1.3} 0`;
    }
    const lidG = s('g', { class: 'fm-lidg' }, [s('path', { class: 'fm-lid', d: lidD }), s('path', { class: 'fm-lid-edge', d: edgeD, fill: 'none' })]);
    const ring = s('circle', { r, class: 'fm-ring' });
    // asleep: a soft closed-eye curve on the shut lid, turned up at the ends like a calm smile
    const sleepLine = s('path', { class: 'fm-sleepline', d: `M${-r * 0.62} ${r * 0.12}Q0 ${r * 0.62} ${r * 0.62} ${r * 0.12}`, fill: 'none' });
    const g = s('g', { class: 'fm-eye', transform: `translate(${cx} ${cy})` }, [
      s('clipPath', { id }, [s('circle', { r: r - 0.5 })]),
      s('circle', { r, class: 'fm-iris' }),
      s('circle', { r: r * 0.78, class: 'fm-iris-in' }),
      s('g', { 'clip-path': `url(#${id})` }, [pupil, lidG]),
      ring,
      sleepLine,
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
      es = MARK.eyes.map((e) => eye(e.cx, e.cy, e.r, svg));
      es.forEach((e) => head.append(e.g));
      // gape: hinged at the mouth line, the upper beak folds up while the wide
      // yellow mouth and lower jaw unfold downward (see .fm.gaping in app.css)
      const mouth = s('g', { class: 'fm-mouth' }), jaw = s('g', { class: 'fm-jaw' });
      for (const l of MARK.front) {
        if (l.mouth) { mouth.append(layer(l)); if (!mouth.parentNode) head.append(mouth); }
        else if (l.jaw) { jaw.append(layer(l)); if (!jaw.parentNode) head.append(jaw); }
        else head.append(layer(l));
      }
      const [hx, hy] = MARK.hinge;
      mouth.style.transformOrigin = jaw.style.transformOrigin = `${hx}px ${hy}px`;
      svg.setAttribute('viewBox', MARK.viewBox.join(' '));
      head.style.transformOrigin = '64px 104px';
      heads.add({ svg, head });
      // asleep: z's drift up from beside the head, one after another (see .fm.asleep in app.css)
      svg.append(s('g', { class: 'fm-zs', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => {
        const z = s('text', { class: 'fm-z', x: 100, y: 30, 'font-family': FONT });
        z.textContent = 'z';
        z.style.animationDelay = i * 1.1 + 's';
        return z;
      })));
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
      es = [eye(-E, 0, R, svg), eye(E, 0, R, svg)];
      es.forEach((e) => head.append(e.g));
      const minX = leftX - frW - 4, maxX = rightX + uthW + 4, minY = -R - 6, maxY = base + fs * 0.26;
      svg.setAttribute('viewBox', `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`);
    }
    svg.prepend(head);
    svgs.add(svg);
    svg.classList.toggle('asleep', mood === 'asleep');
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
    for (const svg of svgs) { if (!svg.isConnected) svgs.delete(svg); else svg.classList.toggle('asleep', m === 'asleep'); }
    if (!blinking) applyLids();
  }

  function blink(twice) {
    if (isShy() || blinking || mood === 'sleepy' || mood === 'asleep') return;
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

  /* the frogmouth's threat display: eyes wide, enormous yellow gape */
  function startle(svg) {
    activity();
    svg.classList.add('gaping');
    setMood('wide');
    clearTimeout(svg._gape);
    svg._gape = setTimeout(() => { svg.classList.remove('gaping'); setMood('rest'); }, 1100);
  }

  function activity() {
    lastAct = now();
    if (mood === 'squint' || mood === 'sleepy' || mood === 'asleep') { setMood('rest'); blink(true); }
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

  // idle → squint → sleepy → asleep; random blinks while awake
  setInterval(() => {
    const idle = now() - lastAct;
    if (idle > ASLEEP) setMood('asleep');
    else if (idle > SLEEPY) setMood('sleepy');
    else if (idle > DOZE) setMood('squint');
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
