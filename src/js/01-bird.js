/* ── the frogmouth (the bird) ────────────────────────────────────────────────
   The wordmark "frogmouth" where both o's are the bird's amber eyes.
   Eyes follow the pointer (or the text caret while typing), blink,
   squint when idle (frogmouths camouflage by narrowing their eyes) and
   shut tight while a secret or passphrase is being typed. */
const Bird = (() => {
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

  function eye(cx, cy, r, svg) {
    const id = 'fmeye' + ++clipN;
    const pupil = s('g', { class: 'fm-pupil' }, [
      s('circle', { r: r * 0.47, class: 'fm-pup' }),
      s('circle', { r: r * 0.15, cx: -r * 0.17, cy: -r * 0.2, class: 'fm-glint' }),
    ]);
    const lid = s('path', {
      class: 'fm-lid',
      d: `M${-r * 1.3} ${-r * 2.6}H${r * 1.3}V0Q0 ${r * 0.42} ${-r * 1.3} 0Z`,
    });
    const lidEdge = s('path', { class: 'fm-lid-edge', d: `M${-r * 1.3} 0Q0 ${r * 0.42} ${r * 1.3} 0`, fill: 'none' });
    const lidG = s('g', { class: 'fm-lidg' }, [lid, lidEdge]);
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

  /* Build an SVG. kind = 'big' (welcome: whole bird on a branch)
     | 'face' (header: head, brows and beak around the wordmark) | 'mini' (wordmark only). */
  function make(kind = 'mini') {
    // 'icon' is the bird on its own (no lettering), small enough to sit beside the logo
    const icon = kind === 'icon', big = kind === 'big' || icon, face = big || kind === 'face';
    const R = big ? 27 : 26; // eye radius
    const E = 100; // eye centre x offset from 0
    const pad = big ? 12 : 9;
    const gmW = measure('gm', 100);
    const fs = (2 * (E - R - pad)) / gmW * 100;
    const frW = measure('fr', fs), uthW = measure('uth', fs);
    const base = fs * 0.27; // baseline so the x-height centres on the eyes
    const leftX = -E - R - pad, rightX = E + R + pad;

    const svg = s('svg', { class: 'fm fm-' + kind, role: 'img', 'aria-label': 'frogmouth' });
    const head = s('g', { class: 'fm-head' });
    const word = s('g', { class: 'fm-word' });
    const txt = (t, x, anchor) => {
      const el = s('text', { x, y: base, 'text-anchor': anchor, 'font-size': fs.toFixed(1), 'font-family': FONT });
      el.textContent = t;
      return el;
    };

    if (big) {
      const plume = s('g', { class: 'fm-plume' });
      // branch it is perched on (behind the bird)
      if (!icon) {
        plume.append(s('path', { class: 'fm-branch', d: 'M-310 352 C-170 328 90 344 310 312' }));
        plume.append(s('path', { class: 'fm-twig', d: 'M186 326 C214 298 244 290 276 292M-214 342 C-236 362 -256 372 -290 376' }));
      }
      // long tail hanging below the branch, like a broken-off stick
      plume.append(s('path', { class: 'fm-body', d: 'M-34 330 L-26 446 Q0 458 26 446 L34 330Z' }));
      plume.append(s('path', { class: 'fm-streak', d: 'M-8 360 L-6 440M10 356 L9 436' }));
      // upright, tapering body: frogmouths pose as dead branches
      plume.append(s('path', { class: 'fm-body', d: 'M-150 60 C-170 150 -128 262 -60 338 Q0 362 60 338 C128 262 170 150 150 60Z' }));
      // shoulders/wings folded at the sides
      plume.append(s('path', { class: 'fm-wing', d: 'M-150 70 C-176 170 -140 270 -84 330 C-120 250 -128 160 -112 96Z' }));
      plume.append(s('path', { class: 'fm-wing', d: 'M150 70 C176 170 140 270 84 330 C120 250 128 160 112 96Z' }));
      // bark-like streaks down the breast
      const streaks = [[-78, 150, -86, 230], [-48, 166, -54, 276], [-16, 150, -12, 300], [16, 170, 20, 296], [48, 160, 54, 270], [80, 150, 88, 226], [-34, 240, -30, 330], [32, 236, 28, 326], [0, 260, 2, 340]];
      streaks.forEach(([x1, y1, x2, y2]) => plume.append(s('path', { class: 'fm-streak', d: `M${x1} ${y1} Q${(x1 + x2) / 2 + 4} ${(y1 + y2) / 2} ${x2} ${y2}` })));
      // feet gripping the branch
      plume.append(s('path', { class: 'fm-feet', d: 'M-38 340 l-9 14 M-30 342 l0 15 M-22 342 l7 13 M22 342 l-7 13 M30 342 l0 15 M38 340 l9 14' }));
      svg.append(plume);
    }
    if (face && !big) {
      // compact head for the header: same bird, flatter so the letters stay readable
      head.append(s('path', { class: 'fm-skull', d: 'M-176 8 C-180 -38 -116 -62 -36 -64 Q0 -65 36 -64 C116 -62 180 -38 176 8 C170 52 112 86 0 92 C-112 86 -170 52 -176 8Z' }));
      const brow = (sx) => {
        const g = s('g', { class: 'fm-brow' });
        [[30, -34, 90, -58, 156, -48], [44, -38, 104, -66, 172, -64], [18, -30, 70, -46, 128, -30]].forEach(([a, b, c, d, e, f]) =>
          g.append(s('path', { d: `M${sx * a} ${b} Q${sx * c} ${d} ${sx * e} ${f}` })));
        return g;
      };
      head.append(brow(-1), brow(1));
      head.append(s('path', { class: 'fm-beak', d: 'M-92 46 Q0 28 92 46 Q70 72 22 84 Q8 90 0 98 Q-8 90 -22 84 Q-70 72 -92 46Z' }));
      head.append(s('path', { class: 'fm-gape', d: 'M-92 46 Q-46 68 0 72 Q46 68 92 46' }));
    } else if (face) {
      // very broad, flat head
      head.append(s('path', { class: 'fm-skull', d: 'M-192 18 C-198 -48 -128 -92 -40 -96 Q0 -98 40 -96 C128 -92 198 -48 192 18 C186 74 132 116 0 126 C-132 116 -186 74 -192 18Z' }));
      // mottled crown
      head.append(s('path', { class: 'fm-streak', d: 'M-60 -80 q4 16 0 30M-30 -86 q4 18 0 34M0 -88 q4 18 0 36M30 -86 q4 18 0 34M60 -80 q4 16 0 30' }));
      // bristly tufts flaring over the eyes
      const brow = (sx) => {
        const g = s('g', { class: 'fm-brow' });
        [[34, -38, 96, -70, 170, -62], [46, -44, 110, -86, 186, -92], [58, -50, 116, -100, 158, -126], [22, -32, 74, -54, 140, -36]].forEach(([a, b, c, d, e, f]) =>
          g.append(s('path', { d: `M${sx * a} ${b} Q${sx * c} ${d} ${sx * e} ${f}` })));
        return g;
      };
      head.append(brow(-1), brow(1));
      // the enormous frog-wide beak the bird is named for, hooked at the tip
      head.append(s('path', { class: 'fm-beak', d: 'M-118 54 Q0 30 118 54 Q96 92 30 112 Q12 120 0 132 Q-12 120 -30 112 Q-96 92 -118 54Z' }));
      head.append(s('path', { class: 'fm-beak-top', d: 'M-60 50 Q0 40 60 50 Q30 70 0 76 Q-30 70 -60 50Z' }));
      head.append(s('path', { class: 'fm-gape', d: 'M-118 54 Q-60 86 0 92 Q60 86 118 54' }));
      head.append(s('path', { class: 'fm-bristle', d: 'M-22 48 l-8 -12 M-8 46 l-3 -14 M8 46 l3 -14 M22 48 l8 -12' }));
    } else {
      // little brow strokes so the mini mark still reads as a face
      head.append(s('path', { class: 'fm-mini-brow', d: `M${-E - R * 1.15} ${-R * 1.25} Q${-E} ${-R * 1.75} ${-E + R * 1.1} ${-R * 1.15}` }));
      head.append(s('path', { class: 'fm-mini-brow', d: `M${E - R * 1.1} ${-R * 1.15} Q${E} ${-R * 1.75} ${E + R * 1.15} ${-R * 1.25}` }));
    }

    if (!icon) {
      word.append(txt('fr', leftX, 'end'), txt('gm', 0, 'middle'), txt('uth', rightX, 'start'));
      head.append(word);
    }
    const e1 = eye(-E, 0, R, svg), e2 = eye(E, 0, R, svg);
    head.append(e1.g, e2.g);
    svg.append(head);

    const minX = Math.min(leftX - frW, big ? -310 : face ? -180 : 1e9) - 6;
    const maxX = Math.max(rightX + uthW, big ? 310 : face ? 180 : -1e9) + 6;
    const minY = big ? -132 : face ? -70 : -R * 1.9;
    const maxY = big ? 462 : face ? 100 : base + fs * 0.26;
    svg.setAttribute('viewBox', icon ? '-200 -134 400 470' : `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`);

    if (face) heads.add({ svg, head });
    svg.addEventListener('click', () => startle(svg));
    // wake up: eyes open with a slow blink, once.
    setTimeout(() => { setLid(e1, lidAmt()); setLid(e2, lidAmt()); }, big ? 650 : 250);
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
      hd.head.style.transform = `rotate(${clamp(dx / 90, -5, 5).toFixed(2)}deg)`;
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
