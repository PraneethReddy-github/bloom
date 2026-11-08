/* ══════════════════════════════════════════════════════════════════
   Bloom — site interactions.
   ══════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine   = window.matchMedia('(pointer: fine)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────────  1. petal cursor trail  ───────────── */

const petals = (() => {
  const cv = $('#petals');
  const ctx = cv.getContext('2d');
  const COLORS = ['#f2eee7', '#e0ab95', '#d9cec0', '#c9b3a4', '#a8bfae'];
  const MAX = 190;
  let bits = [], dpr = 1, running = false, on = fine && !reduce;

  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener('resize', fit);

  function spawn(x, y, force) {
    if (bits.length >= MAX) return;
    const s = 3.4 + Math.random() * 4.6;
    bits.push({
      x: x + (Math.random() - .5) * 10,
      y: y + (Math.random() - .5) * 10,
      vx: (Math.random() - .5) * (force ? 4.2 : 1.1),
      vy: (Math.random() - .5) * (force ? 4.2 : .7) - (force ? 1 : .1),
      g:  .014 + Math.random() * .026,
      size: force ? s * .8 : s,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * .07,
      flip: Math.random() * Math.PI * 2,
      flipV: .025 + Math.random() * .05,
      sway: .35 + Math.random() * .9,
      phase: Math.random() * Math.PI * 2,
      life: 0,
      max: 150 + Math.random() * 130,
      color: COLORS[(Math.random() * COLORS.length) | 0]
    });
    start();
  }

  function petal(p, alpha) {
    const s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.max(.14, Math.abs(Math.cos(p.flip))));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * .95, -s * .5, s * .68, s * .8, 0, s);
    ctx.bezierCurveTo(-s * .68, s * .8, -s * .95, -s * .5, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i];
      p.life++;
      p.vy += p.g;
      p.vx += Math.sin(p.life * .035 + p.phase) * p.sway * .012;
      p.vx *= .992; p.vy *= .996;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.spin; p.flip += p.flipV;

      const t = p.life / p.max;
      const a = t < .12 ? t / .12 : Math.max(0, 1 - (t - .12) / .88);
      if (t >= 1 || p.y > innerHeight + 40) { bits.splice(i, 1); continue; }
      petal(p, a * .85);
    }
    if (bits.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }

  let lx = 0, ly = 0, travel = 0, seeded = false;
  addEventListener('pointermove', (e) => {
    document.documentElement.style.setProperty('--mx', e.clientX + 'px');
    document.documentElement.style.setProperty('--my', e.clientY + 'px');
    if (!on) return;
    if (!seeded) { lx = e.clientX; ly = e.clientY; seeded = true; return; }
    travel += Math.hypot(e.clientX - lx, e.clientY - ly);
    lx = e.clientX; ly = e.clientY;
    if (travel > 15) { travel = 0; spawn(e.clientX, e.clientY, false); }
  }, { passive: true });

  return {
    burst(x, y, n = 18) { if (!on) return; for (let i = 0; i < n; i++) spawn(x, y, true); },
    get enabled() { return on; },
    set enabled(v) { on = v; if (!v) bits = []; }
  };
})();

/* ─────────────  2. bloom mark  ───────────── */

const MARK = (sw = 70) => `<svg viewBox="0 0 1024 1024" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="${sw}">
    <circle cx="512" cy="386.1" r="140.3"/><circle cx="633.695" cy="474.55" r="140.3"/>
    <circle cx="587.335" cy="617.9" r="140.3"/><circle cx="436.665" cy="617.9" r="140.3"/>
    <circle cx="390.305" cy="474.55" r="140.3"/>
  </g></svg>`;

['#brandMark', '#footMark', '#closerMark'].forEach((sel, i) => {
  const el = $(sel);
  if (el) el.innerHTML = MARK(i === 2 ? 52 : 70);
});
$$('.closer-mark circle').forEach((c, i) => c.style.animationDelay = (i * .28) + 's');

/* voice waveform: a speech-like trace (variable-amplitude carrier) that scrolls.
   Pattern is 480 wide, drawn twice (960) and translated -480 for a seamless loop. */
(() => {
  const w = $('#voiceWave');
  if (!w) return;
  const TAU = Math.PI * 2, W = 960, mid = 22, carrier = 40;
  const env = x => 0.22 + 0.78 * Math.abs(Math.sin((x % 480) / 480 * Math.PI * 3)); // 3 speech "syllables"
  const trace = (amp, phase) => {
    let d = '';
    for (let x = 0; x <= W; x += 4) {
      const y = mid + amp * env(x) * Math.sin(x / carrier * TAU + phase);
      d += (x ? 'L' : 'M') + ` ${x} ${y.toFixed(2)}`;
    }
    return d;
  };
  w.innerHTML = `<svg viewBox="0 0 480 44" preserveAspectRatio="none"><g class="wgroup">`
    + `<path class="wpath faint" d="${trace(9, Math.PI)}"/>`
    + `<path class="wpath" d="${trace(14, 0)}"/></g></svg>`;
})();

/* ─────────────  3. interactive dial demo  ───────────── */

const I = {
  grid:     'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  globe:    'M12 3a9 9 0 100 18 9 9 0 000-18zM3.2 12h17.6M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18',
  terminal: 'M5 7.5l4.5 4.5L5 16.5M12.5 17H19',
  monitor:  'M3 5h18v11H3zM8.5 20h7M12 16v4',
  music:    'M9 17.5V5.5l10-2v12M9 17.5a2.6 2.6 0 11-5.2 0 2.6 2.6 0 015.2 0zM19 15.5a2.6 2.6 0 11-5.2 0 2.6 2.6 0 015.2 0z',
  clipboard:'M9.5 4.5h5v2.5h-5zM8 6H5.5v14h13V6H16',
  zap:      'M13.5 3L6 13.5h5l-1 7.5L18 10.5h-5z',
  gear:     'M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM12 2.6v3M12 18.4v3M21.4 12h-3M5.6 12h-3M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1M18.6 18.6l-2.1-2.1M7.5 7.5L5.4 5.4',
  folder:   'M3.5 6.5h5.5l2 2h9.5v9.5h-17z',
  pencil:   'M4 20h4L20.2 7.8l-4-4L4 16z',
  cpu:      'M8.5 8.5h7v7h-7zM4.5 10.5h4M4.5 13.5h4M15.5 10.5h4M15.5 13.5h4M10.5 4.5v4M13.5 4.5v4M10.5 15.5v4M13.5 15.5v4',
  activity: 'M3 12.5h4l3 7.5 4-16 3 8.5h4',
  plus:     'M12 5.5v13M5.5 12h13',
  briefcase:'M3.5 8.5h17v11h-17zM9 8.5V5.5h6v3',
  code:     'M9.2 8L5 12l4.2 4M14.8 8L19 12l-4.2 4',
  play:     'M8.5 5.5l10 6.5-10 6.5z',
  home:     'M4 11l8-7 8 7v9.5H4z',
  camera:   'M4 8h4l1.2-2h5.6L16 8h4v11H4zM12 16.2a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z',
  lock:     'M6.2 11h11.6v9H6.2zM9 11V8.2a3 3 0 016 0V11',
  moon:     'M20 14.4A8.2 8.2 0 019.6 4 8.2 8.2 0 1020 14.4z',
  sun:      'M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4',
  volx:     'M4 9h3.5L12 5v14l-4.5-4H4zM15.8 9.6l4.6 4.8M20.4 9.6l-4.6 4.8',
  vol:      'M4 9h3.5L12 5v14l-4.5-4H4zM15.5 9.4a3.8 3.8 0 010 5.2M18.4 7a7.6 7.6 0 010 10',
  volLow:   'M4 9h3.5L12 5v14l-4.5-4H4zM15.5 9.4a3.8 3.8 0 010 5.2',
  zzz:      'M4 6.5h6.5L4 13h6.5M13.5 13h6l-6 6h6',
  mail:     'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
  sparkle:  'M12 3.2l2.1 6.7 6.7 2.1-6.7 2.1-2.1 6.7-2.1-6.7L3.2 12l6.7-2.1z',
  next:     'M6.5 5.5l9 6.5-9 6.5zM18 5.5v13',
  prev:     'M17.5 5.5l-9 6.5 9 6.5zM6 5.5v13',
  timer:    'M12 7.5v5l3.5 2M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Z',
  pause:    'M9.5 5.5v13M14.5 5.5v13',
  stop:     'M6.8 6.8h10.4v10.4H6.8z',
  image:    'M4 5h16v14H4zM4 16.5l4.5-4.5 4 4 3-3 4.5 4.5M15.5 9.5h.01',
  file:     'M6.5 3h7.5l4 4v14H6.5zM14 3v4.5h4',
  wand:     'M5 19L14.5 9.5M14 4l1 2.2 2.2 1L15 8.2 14 10.4 13 8.2 10.8 7.2 13 6.2zM18.5 12.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z',
  package:  'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  palette:  'M12 3.2a8.8 8.8 0 100 17.6c1.6 0 2.2-1.1 1.7-2.4-.5-1.3.4-2.4 1.8-2.4H17.5a3.5 3.5 0 003.5-3.5c0-5-4-9.3-9-9.3zM7.8 11.2h.01M10.6 7.8h.01M15 8.2h.01',
  layers:   'M12 3.5l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  wrench:   'M14.5 6.2a4 4 0 005 5L20.5 12l-8.8 8.8a2.2 2.2 0 01-3.1-3.1L17.4 9M14.5 6.2a4 4 0 014.3-.9l-2.4 2.4',
  scissors: 'M6 8.2a2.7 2.7 0 100-5.4 2.7 2.7 0 000 5.4zM6 21.2a2.7 2.7 0 100-5.4 2.7 2.7 0 000 5.4zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  trend:    'M3.5 17l6-6 4 4 7-7.5M15 7.5h5.5V13',
  refresh:  'M20 12a8 8 0 01-14.2 5M4 12a8 8 0 0114.2-5M18.5 3v4.5H14M5.5 21v-4.5H10',
  repeat:   'M17 3l3.5 3.5L17 10M4 11V9.5A3 3 0 017 6.5h13.5M7 21l-3.5-3.5L7 14M20 13v1.5a3 3 0 01-3 3H3.5',
  shield:   'M12 3l7.5 3v6c0 4.4-3 7.4-7.5 9-4.5-1.6-7.5-4.6-7.5-9V6z',
  book:     'M5 4.5h10.5a3 3 0 013 3V20H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10.5',
  text:     'M5 6.5h14M5 11h14M5 15.5h9',
  star:     'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  square:   'M5 5h14v14H5z',
  sliders:  'M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5',
  tag:      'M3.5 12.2V4.5h7.7L20.5 13.8 13.8 20.5zM8 8.3h.01',
  video:    'M3.5 6.5h12v11h-12zM15.5 10.5l5-3v9l-5-3',
  volxm:    'M4 9h3.5L12 5v14l-4.5-4H4zM15.8 9.6l4.6 4.8M20.4 9.6l-4.6 4.8',
  bloom:    ''
};

const TREE = {
  children: [
    { l: 'Apps', i: 'grid', children: [
      { l: 'Files', i: 'folder' }, { l: 'Text Editor', i: 'pencil' },
      { l: 'Calculator', i: 'cpu' }, { l: 'System Monitor', i: 'activity' } ] },
    { l: 'Browser', i: 'globe', children: [
      { l: 'New Tab', i: 'plus' }, { l: 'Work Tabs', i: 'briefcase' },
      { l: 'GitHub', i: 'code' }, { l: 'YouTube', i: 'play' } ] },
    { l: 'Terminal', i: 'terminal', children: [
      { l: 'Home', i: 'home' }, { l: 'Projects', i: 'folder' }, { l: 'Processes', i: 'activity' } ] },
    { l: 'System', i: 'monitor', children: [
      { l: 'Screenshot', i: 'camera' }, { l: 'Lock Screen', i: 'lock' },
      { l: 'Dark Mode', i: 'moon' }, { l: 'Night Light', i: 'sun' },
      { l: 'Mute', i: 'volx' }, { l: 'Sleep', i: 'zzz' } ] },
    { l: 'Media', i: 'music', children: [
      { l: 'Play / Pause', i: 'play' }, { l: 'Next', i: 'next' }, { l: 'Previous', i: 'prev' },
      { l: 'Volume +', i: 'vol' }, { l: 'Volume −', i: 'volLow' } ] },
    { l: 'Snippets', i: 'clipboard', children: [
      { l: 'Shrug', i: 'sparkle' }, { l: 'My Email', i: 'mail' }, { l: 'Bloom Sig', i: 'bloom' } ] },
    { l: 'Start My Day', i: 'zap' },
    { l: 'Settings', i: 'gear' }
  ]
};

// Replica of the real Bloom dial: a complete ring of contiguous pie-wedge
// segments (annulus sectors) around the bud, bare icons sitting in each wedge —
// matching renderer/bloom.js ringStyle:'dial', not floating circles.
function makeDial(wrap, hint, treeFn, opts = {}) {
  if (!wrap || !hint) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, cls) => { const e = document.createElementNS(NS, n); if (cls) e.setAttribute('class', cls); return e; };

  const svg = el('svg', 'dial-svg');
  svg.setAttribute('aria-hidden', 'true');
  wrap.appendChild(svg);

  const bud = document.createElement('button');
  bud.className = 'dial-bud';
  bud.type = 'button';
  bud.setAttribute('aria-label', 'Toggle the demo dial');
  bud.innerHTML = MARK(74);
  wrap.appendChild(bud);
  $$('.dial-bud circle', wrap).forEach((c, i) => c.style.transitionDelay = (i * 45) + 'ms');

  let open = false, path = [], hintLock = 0, cx = 0, cy = 0, dx = 0, dy = 0;
  const TAU = Math.PI * 2;
  const say = (t, lock) => { if (Date.now() < hintLock && !lock) return; hint.textContent = t; if (lock) hintLock = Date.now() + 1400; };
  const P = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;

  // annulus sector with independent inner/outer angles → constant parallel gaps
  function sector(rIn, rOut, a0i, a1i, a0o, a1o) {
    const lo = (a1o - a0o) > Math.PI ? 1 : 0, li = (a1i - a0i) > Math.PI ? 1 : 0;
    return `M ${P(rOut, a0o)} A ${rOut} ${rOut} 0 ${lo} 1 ${P(rOut, a1o)}`
         + ` L ${P(rIn, a1i)} A ${rIn} ${rIn} 0 ${li} 0 ${P(rIn, a0i)} Z`;
  }
  function arcPath(r, a0, a1) {
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${P(r, a0)} A ${r} ${r} 0 ${large} 1 ${P(r, a1)}`;
  }

  function iconG(node, px, py, k) {
    const g = el('g', 'dial-ic');
    if (node.i === 'bloom') {
      g.setAttribute('transform', `translate(${px} ${py}) scale(${k / 600})`);
      g.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="70" transform="translate(-512 -512)">
        <circle cx="512" cy="386.1" r="140.3"/><circle cx="633.695" cy="474.55" r="140.3"/>
        <circle cx="587.335" cy="617.9" r="140.3"/><circle cx="436.665" cy="617.9" r="140.3"/>
        <circle cx="390.305" cy="474.55" r="140.3"/></g>`;
    } else {
      g.setAttribute('transform', `translate(${px} ${py}) scale(${k / 24}) translate(-12 -12)`);
      g.innerHTML = `<path d="${I[node.i] || I.grid}"/>`;
    }
    return g;
  }

  // birth: grow the ring group out of the bud (SVG transform attr — reliable across hide/show)
  function grow(g) {
    if (reduce) return;
    const t0 = performance.now(), D = 460;
    (function tick(now) {
      if (!g.isConnected) return;
      const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3), s = .35 + .65 * e;
      g.setAttribute('transform', `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`);
      if (p < 1) requestAnimationFrame(tick); else g.removeAttribute('transform');
    })(t0);
  }

  function fadeIn(g) {
    const t0 = performance.now(), D = 180;
    g.style.opacity = '0';
    (function tick(now) {
      if (!g.isConnected) return;
      const p = Math.min(1, (now - t0) / D);
      g.style.opacity = String(p);
      if (p < 1) requestAnimationFrame(tick); else g.style.opacity = '';
    })(t0);
  }

  function render(bornLvl = -1, isHover = false) {
    const viewBase = Math.min(wrap.clientWidth, wrap.clientHeight) || 480;
    const base = Math.min(viewBase, 380); // clamp size so it doesn't get too big
    cx = (wrap.clientWidth || viewBase) / 2;
    cy = (wrap.clientHeight || viewBase) / 2;
    svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth || viewBase} ${wrap.clientHeight || viewBase}`);
    svg.textContent = '';
    
    bud.style.left = '50%';
    bud.style.top = '50%';
    bud.style.translate = `${dx}px ${dy}px`;
    svg.style.translate = `${dx}px ${dy}px`;

    bud.classList.toggle('open', open);
    if (!open) {
      bud.innerHTML = MARK(74);
      return;
    }
    bud.innerHTML = '<span></span>';

    const nsB = base * 0.13, pad = base * 0.02, gap = base * 0.02, gapPx = base * 0.006, SHRINK = 0.88;
    const levels = [treeFn(), ...path.map(p => p.children || [])];

    // pass 1 — angles per level; a folder's ring fans around the wedge you opened
    const meta = [];
    let parentAng = -Math.PI / 2;
    levels.forEach((kids, lvl) => {
      const anchor = parentAng;
      let angles, half;
      if (lvl === 0) {
        const step = TAU / kids.length; half = step / 2;
        angles = kids.map((_, i) => -Math.PI / 2 + i * step);
      } else {
        const total = Math.min(TAU * 0.92, kids.length * 0.62), step = total / kids.length;
        half = step / 2;
        angles = kids.map((_, i) => anchor - total / 2 + step * (i + 0.5));
      }
      const trail = path[lvl], ti = trail ? kids.indexOf(trail) : -1;
      meta[lvl] = { kids, angles, half, trail, anchor };
      if (ti >= 0) parentAng = angles[ti];
    });

    // pass 2 — telescoping radii: calculate outward so Layer 1 stays at a fixed distance from the bud
    const L = levels.length - 1, geo = [];
    let curMid = base * 0.22;
    for (let lvl = 0; lvl <= L; lvl++) {
      const s = Math.pow(SHRINK, L - lvl), ns = nsB * s;
      const rIn = curMid - ns / 2 - pad * s, rOut = curMid + ns / 2 + pad * s;
      geo[lvl] = { rMid: curMid, rIn, rOut, ns, s };
      if (lvl < L) {
        const sOut = Math.pow(SHRINK, L - (lvl + 1));
        curMid = rOut + gap * sOut + (nsB * sOut / 2 + pad * sOut);
      }
    }

    // pass 3 — draw inner→outer so the active ring lands on top
    levels.forEach((_, lvl) => {
      const { kids, angles, half, trail, anchor } = meta[lvl];
      const { rIn, rOut, rMid, ns, s } = geo[lvl];
      const dIn = Math.asin(Math.min(.5, gapPx / rIn)), dOut = Math.asin(Math.min(.5, gapPx / rOut));
      const ring = el('g', 'dial-ring');

      // spoke: from the parent wedge's outer rim out to this ring's inner rim
      if (lvl > 0) {
        const sp = el('line', 'dial-spoke');
        const from = geo[lvl - 1].rOut + 2, to = rIn - 2;
        sp.setAttribute('x1', cx + from * Math.cos(anchor)); sp.setAttribute('y1', cy + from * Math.sin(anchor));
        sp.setAttribute('x2', cx + to * Math.cos(anchor)); sp.setAttribute('y2', cy + to * Math.sin(anchor));
        ring.appendChild(sp);
      }

      kids.forEach((node, i) => {
        const a = angles[i];
        const isTrail = trail === node, isDim = trail && trail !== node;
        const wg = el('g', 'dial-wedge' + (isTrail ? ' trail' : isDim ? ' dim' : ''));

        const seg = el('path', 'dial-seg');
        seg.setAttribute('d', sector(rIn, rOut, a - half + dIn, a + half - dIn, a - half + dOut, a + half - dOut));
        wg.appendChild(seg);

        if (node.children) {
          const sub = el('path', 'dial-sub');
          const rSub = rOut - base * 0.014 * s, dSub = Math.asin(Math.min(.5, (gapPx + 3) / rSub));
          sub.setAttribute('d', arcPath(rSub, a - half + dSub, a + half - dSub));
          wg.appendChild(sub);
        }

        const ix = cx + rMid * Math.cos(a), iy = cy + rMid * Math.sin(a);
        wg.appendChild(iconG(node, ix, iy - (opts.labels ? ns * 0.1 : 0), ns * (opts.labels ? 0.42 : 0.52)));
        if (opts.labels) {   // the file ring names its petals: a dozen look-alike icons need it
          const t = el('text', 'dial-lbl');
          t.setAttribute('x', ix); t.setAttribute('y', iy + ns * 0.3); t.setAttribute('text-anchor', 'middle');
          t.setAttribute('font-size', Math.max(7, ns * 0.17).toFixed(1));
          t.textContent = node.l.length > 12 ? node.l.slice(0, 11) + '…' : node.l;
          wg.appendChild(t);
        }

        wg.addEventListener('pointerenter', () => {
          if (bud._leaveTimer) clearTimeout(bud._leaveTimer);
          say(node.l + (node.children ? ' — folder' : ''), true);
          
          if (open) {
            const span = bud.querySelector('span');
            if (span) span.textContent = node.l;

            let newPath;
            if (node.children) {
              newPath = [...path.slice(0, lvl), node];
            } else {
              newPath = path.slice(0, lvl);
            }

            let pathChanged = newPath.length !== path.length;
            if (!pathChanged) {
              for (let j = 0; j < newPath.length; j++) {
                if (newPath[j] !== path[j]) pathChanged = true;
              }
            }

            if (pathChanged) {
              path = newPath;
              render(node.children ? lvl + 1 : -1, true);
              const newSpan = bud.querySelector('span');
              if (newSpan) newSpan.textContent = node.l;
            }
          }
        });
        
        wg.addEventListener('pointerleave', () => {
          if (open) {
            bud._leaveTimer = setTimeout(() => {
              const span = bud.querySelector('span');
              if (span && span.textContent === node.l) span.textContent = '';
            }, 15);
          }
        });
        wg.addEventListener('click', (e) => {
          e.stopPropagation();
          const b = wg.getBoundingClientRect();
          petals.burst(b.left + b.width / 2, b.top + b.height / 2, node.children ? 10 : 20);
          if (node.children) { path = [...path.slice(0, lvl), node]; render(lvl + 1); say(`${node.l} — ${node.children.length} actions`, true); }
          else { say(node.msg || `Ran · ${node.l}`, true); }
        });
        ring.appendChild(wg);
      });

      svg.appendChild(ring);
      if (lvl === bornLvl) {
        if (isHover) fadeIn(ring);
        else grow(ring);
      }
    });
  }

  let moved = false, isDragging = false;
  let startX, startY, initialDx, initialDy;

  bud.addEventListener('pointerdown', (e) => {
    isDragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    initialDx = dx;
    initialDy = dy;
    bud.setPointerCapture(e.pointerId);
  });

  bud.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;
    if (Math.abs(curDx) > 3 || Math.abs(curDy) > 3) moved = true;
    if (moved) {
      let nextDx = initialDx + curDx;
      let nextDy = initialDy + curDy;

      const maxW = wrap.clientWidth / 2 - 27;
      const maxH = wrap.clientHeight / 2 - 27;
      if (nextDx > maxW) nextDx = maxW;
      if (nextDx < -maxW) nextDx = -maxW;
      if (nextDy > maxH) nextDy = maxH;
      if (nextDy < -maxH) nextDy = -maxH;

      dx = nextDx;
      dy = nextDy;
      bud.style.translate = `${dx}px ${dy}px`;
      svg.style.translate = `${dx}px ${dy}px`;
    }
  });

  bud.addEventListener('pointerup', (e) => {
    isDragging = false;
    bud.releasePointerCapture(e.pointerId);
  });

  bud.addEventListener('click', (e) => {
    if (moved) return;
    const b = bud.getBoundingClientRect();
    bud.classList.remove('ping'); void bud.offsetWidth; bud.classList.add('ping');
    petals.burst(b.left + b.width / 2, b.top + b.height / 2, 22);
    if (open && path.length) { path.pop(); render(); say('Back a layer', true); return; }
    open = !open;
    path = [];
    render(0);
    say(open ? 'Open a folder — the ring behind it dims' : 'Click the bud');
  });

  document.addEventListener('click', (e) => {
    if (opts.sticky) return;   // the file ring stays open while you pick a file type beside it
    if (open && !bud.contains(e.target) && !e.target.closest('.dial-wedge')) {
      open = false;
      path = [];
      render();
      say('Click the bud');
    }
  });

  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    if (opts.sticky && !path.length) return;
    if (path.length) path.pop(); else open = false;
    render();
    say(open ? 'Back a layer' : 'Click the bud', true);
  });

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => render(), 160); });

  if (opts.startOpen) { open = true; render(0); say(opts.openHint || 'Open a folder — the ring behind it dims'); }
  return {
    // the tree changed (another file type): start the ring over, keeping it open
    reload(hintText) { path = []; render(open ? 0 : -1); if (hintText) say(hintText, true); }
  };
}

makeDial($('#dialDemo'), $('#stageHint'), () => TREE.children);

/* ─────────────  3b. file ring demo  ─────────────
   The same ring, filled the way the real one is when a file is held over the bud. Orders and
   labels mirror converters.js: tools first, then formats; dropping on the bud groups the formats. */

(function fileRing() {
  const wrap = $('#fileRing');
  if (!wrap) return;

  const n = (l, i, msg) => ({ l, i, msg });
  const conv = (l, i = 'image') => n(l, i, `Saved photo.${l.toLowerCase()} next to the original`);
  const studio = (items) => ({ l: 'Studio', i: 'palette', children: items.map(([l, i]) => n(l, i, `Opens ${l.replace('…', '')} in Studio`)) });
  const folder = (l, i, kids) => ({ l, i, children: kids });

  const KINDS = {
    image: {
      file: 'photo.jpg',
      tools: () => [
        studio([['Crop…', 'scissors'], ['Edit…', 'sliders'], ['Add BG…', 'palette'], ['Annotate…', 'pencil'], ['Redact…', 'shield'], ['Resize…', 'trend'], ['Compress…', 'package'], ['Info…', 'tag']]),
        folder('Quick', 'wrench', [n('Square', 'square', 'Saved photo-crop-1x1.jpg'), n('16:9', 'square', 'Saved photo-crop-16x9.jpg'), n('Resize 50%', 'trend', 'Saved photo-50pct.jpg'),
          n('Rotate', 'refresh', 'Saved photo-rotated.jpg'), n('Flip', 'repeat', 'Saved photo-flipped.jpg'), n('Black & white', 'moon', 'Saved photo-bw.jpg'), n('Strip location', 'shield', 'Saved photo-no-location.jpg')]),
        n('Remove BG', 'wand', 'Saved photo-no-bg.png with a transparent background'),
        n('Compress', 'package', 'Saved photo-compressed.webp · 2.4 MB → 310 KB (87% smaller)')
      ],
      formats: () => [conv('PNG'), conv('WebP'), conv('AVIF'), conv('PDF', 'file'), folder('More formats', 'layers', [conv('ICO', 'star'), conv('TIFF'), conv('BMP'), conv('GIF')])],
      hold: 'Holding a photo over the bud: Studio, Quick tools, Remove BG and Compress come first, then the formats.',
      drop: 'Dropped on the bud: Open and Copy path, then the same tools, with every format tucked under one Convert petal.'
    },
    pdf: {
      file: 'contract.pdf',
      tools: () => [
        n('Studio', 'palette', 'Opens the PDF page editor'),
        n('Compress', 'package', 'Saved contract-compressed.pdf · 5.1 MB → 1.2 MB'),
        folder('Tools', 'wrench', [n('Split pages', 'scissors', 'Saved one PDF per page in a folder'), n('Rotate', 'refresh', 'Saved contract-rotated.pdf'),
          n('Password…', 'lock', 'Asks for a password, then saves contract-protected.pdf (AES-256)'), n('Extract images', 'image', 'Saved every embedded picture in a folder'), n('Strip metadata', 'shield', 'Saved contract-clean.pdf')])
      ],
      formats: () => [conv('PNG'), conv('JPG'), conv('TXT', 'text'), conv('DOCX', 'book')],
      hold: 'A PDF opens with Studio (the page editor) first, then Compress and a Tools folder, then the formats.',
      drop: 'Dropped on the bud: Open, then Studio, Compress and Tools, with PNG, JPG, TXT and DOCX under Convert.'
    },
    video: {
      file: 'clip.mp4',
      tools: () => [n('Compress', 'package', 'Saved clip-compressed.mp4 · 180 MB → 42 MB'), folder('Tools', 'wrench', [n('720p', 'trend', 'Saved clip-720p.mp4'), n('Mute', 'volxm', 'Saved clip-muted.mp4')])],
      formats: () => [conv('MP4', 'video'), conv('WebM', 'video'), conv('MKV', 'video'), conv('GIF'), conv('MP3', 'music')],
      hold: 'A video: Compress and a small Tools folder, then MP4, WebM, MKV, GIF, or MP3 to keep just the audio.',
      drop: 'Dropped on the bud: Open, Compress, Tools and one Convert petal.'
    },
    audio: {
      file: 'song.flac',
      tools: () => [],
      formats: () => [conv('MP3', 'music'), conv('WAV', 'music'), conv('OGG', 'music'), conv('M4A', 'music')],
      hold: 'Audio keeps it simple: the formats, straight on the first ring.',
      drop: 'Dropped on the bud: Open, Open folder, Copy path and Convert.'
    },
    doc: {
      file: 'notes.md',
      tools: () => [],
      formats: () => [conv('PDF', 'file'), conv('DOCX', 'book'), conv('HTML', 'code'), conv('TXT', 'text')],
      hold: 'Word, Markdown, text, CSV and HTML files turn into each other. Headings, lists and tables carry over.',
      drop: 'Dropped on the bud: Open, Open folder, Copy path and Convert.'
    },
    batch: {
      file: '3 images',
      tools: () => [],
      formats: () => [n('One PDF', 'file', 'Saved photo-combined.pdf, one page per image'), conv('JPG'), conv('PNG'), conv('WebP'), n('Compress', 'package', 'Saved all three, compressed')],
      hold: 'Drop several images together: combine them into one PDF, convert them all, or compress them all. PDFs offer Merge.',
      drop: 'A batch always shows its own small ring: the actions apply to every file you dropped.',
      batch: true
    }
  };

  let kind = 'image', mode = 'hold';
  const note = $('#fdNote');

  function tree() {
    const k = KINDS[kind], tools = k.tools(), formats = k.formats();
    if (mode === 'hold' || k.batch) return [...tools, ...formats];
    const first = [n('Open', 'file', `Opens ${k.file}`), n('Open folder', 'folder', 'Opens the folder it lives in'), n('Copy path', 'clipboard', 'Path copied to the clipboard')];
    return [...first, ...tools, folder('Convert', 'refresh', formats)];
  }

  const dial = makeDial(wrap, $('#fileHint'), tree, { startOpen: true, sticky: true, labels: true, openHint: 'Open a folder, or pick a petal' });
  const sync = () => { note.textContent = KINDS[kind][mode]; dial && dial.reload(`${KINDS[kind].file} — ${mode === 'hold' ? 'held over the bud' : 'dropped on the bud'}`); };

  $$('.fd-type').forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.ft;
    $$('.fd-type').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', x === b); });
    sync();
  }));
  $$('.fd-mode').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.fm;
    $$('.fd-mode').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
    sync();
  }));
  note.textContent = KINDS[kind][mode];
})();

/* ─────────────  3c. Studio preview  ───────────── */

(function studioMock() {
  const mock = $('#studioMock');
  if (!mock) return;
  const canvas = $('#smCanvas'), frame = $('#smFrame');
  const ICON = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${I[k]}"/></svg>`;
  $$('.sm-tool', mock).forEach(b => b.insertAdjacentHTML('afterbegin', ICON(b.dataset.ic)));

  function pick(t) {
    canvas.dataset.t = t;
    frame.classList.toggle('is-bg', t === 'bg');
    $$('.sm-tool', mock).forEach(b => { b.classList.toggle('is-on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); });
    $$('.sm-p', mock).forEach(p => p.classList.toggle('is-on', p.dataset.t === t));
  }
  $$('.sm-tool', mock).forEach(b => b.addEventListener('click', () => pick(b.dataset.t)));
  pick('crop');
})();

/* ─────────────  4. hero title split  ───────────── */

$$('[data-split]').forEach(el => {
  const txt = el.textContent;
  el.textContent = '';
  [...txt].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.animationDelay = (i * 38 + 120) + 'ms';
    el.appendChild(s);
  });
});

/* ─────────────  5. reveal on scroll  ───────────── */

const revs = $$('.reveal');
if ('IntersectionObserver' in window && !reduce) {
  const io = new IntersectionObserver((es) => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: '0px 0px -70px 0px' });
  revs.forEach(el => io.observe(el));
} else {
  revs.forEach(el => el.classList.add('in'));
}

/* ─────────────  6. card glow + tilt  ───────────── */

if (fine && !reduce) {
  $$('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--cx', (px * 100) + '%');
      card.style.setProperty('--cy', (py * 100) + '%');
      card.style.transform =
        `perspective(900px) rotateX(${(.5 - py) * 4}deg) rotateY(${(px - .5) * 4}deg) translateY(-3px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });

  /* scale-only lift on hover — no chasing-the-cursor movement */
  $$('[data-magnetic]').forEach(el => {
    el.addEventListener('pointerenter', () => { el.style.transform = 'scale(1.035)'; });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/* ─────────────  7. live keymap  ───────────── */

(() => {
  const keys = $$('.key');
  if (!keys.length) return;
  const hit = (sel) => {
    const el = $(`.key[data-k="${sel}"]`);
    if (!el) return;
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 420);
  };
  addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) return hit('Digit');
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Home', '?'].includes(e.key)) hit(e.key);
  });
})();

/* ─────────────  8. focus ring demo  ─────────────
   A real 20/10 block, sped up ~100× so a visitor sees a whole cycle. The colours are
   the app's own rule, fixed in every profile: focus green, break red, paused grey. */
(function ringDemo() {
  const wrap = $('#ringDemo'), prog = $('#ringProg');
  if (!wrap || !prog) return;

  const R = 76, C = 2 * Math.PI * R;
  const time = $('.rp-time', wrap);
  prog.setAttribute('stroke-dasharray', C.toFixed(2));

  const FOCUS_MIN = 20, BREAK_MIN = 10;
  const SPEED = 100;                       // 20 real minutes ≈ 12 s on the page
  const PAUSE_AT = 0.55;                   // hold once mid-focus so the grey state is seen

  let t0 = performance.now(), phaseName = 'focus', pausedUntil = 0, pausedShown = false;

  const mmss = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function frame(now) {
    const total = (phaseName === 'break' ? BREAK_MIN : FOCUS_MIN) * 60000;
    if (pausedUntil) {
      if (now < pausedUntil) { requestAnimationFrame(frame); return; }
      t0 += now - pausedUntil;             // resume where it stopped
      pausedUntil = 0;
      wrap.classList.remove('is-paused');
    }
    const elapsed = (now - t0) * SPEED;
    let remain = total - elapsed;

    if (remain <= 0) {
      if (phaseName === 'focus') { phaseName = 'break'; wrap.classList.add('is-break'); }
      else { phaseName = 'focus'; wrap.classList.remove('is-break'); pausedShown = false; }
      t0 = now;
      requestAnimationFrame(frame);
      return;
    }
    if (phaseName === 'focus' && !pausedShown && remain / total < PAUSE_AT) {
      pausedShown = true;
      pausedUntil = now + 1600;
      wrap.classList.add('is-paused');
    }

    const left = remain / total;
    prog.setAttribute('stroke-dashoffset', (C * (1 - left)).toFixed(2));
    time.textContent = mmss(remain);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Show the pill once unprompted so the hover affordance is discoverable.
  new IntersectionObserver((es, io) => es.forEach(e => {
    if (!e.isIntersecting) return;
    io.disconnect();
    setTimeout(() => wrap.classList.add('is-peek'), 700);
    setTimeout(() => wrap.classList.remove('is-peek'), 3400);
  }), { threshold: .5 }).observe(wrap);
})();

/* ─────────────  9. matrix demo — the cards really do drag  ───────────── */
(function matrixDemo() {
  const grid = $('#quadGrid');
  if (!grid) return;
  let held = null;

  $$('.tcard', grid).forEach(card => {
    card.addEventListener('dragstart', e => {
      held = card;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');   // Firefox needs a payload
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      $$('.quad', grid).forEach(q => q.classList.remove('is-over'));
      held = null;
    });
  });

  $$('.quad', grid).forEach(quad => {
    quad.addEventListener('dragover', e => { e.preventDefault(); quad.classList.add('is-over'); });
    quad.addEventListener('dragleave', e => { if (!quad.contains(e.relatedTarget)) quad.classList.remove('is-over'); });
    quad.addEventListener('drop', e => {
      e.preventDefault();
      quad.classList.remove('is-over');
      if (held) $('.quad-body', quad).appendChild(held);
      petals.burst(e.clientX, e.clientY, 8);
    });
  });
})();

/* ─────────────  10. settings tabs  ───────────── */

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => { b.classList.remove('is-on'); b.setAttribute('aria-selected', 'false'); });
    $$('.tab-panel').forEach(p => p.classList.remove('is-on'));
    btn.classList.add('is-on');
    btn.setAttribute('aria-selected', 'true');
    $('#' + btn.dataset.tab).classList.add('is-on');
  });
});

/* ─────────────  11. nav  ───────────── */

const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

const burger = $('#burger'), menu = $('#mobileMenu');
burger.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
});
$$('a', menu).forEach(a => a.addEventListener('click', () => {
  menu.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
}));

/* ─────────────  12. petal toggle + year  ───────────── */

const toggle = $('#motionToggle');
if (!petals.enabled) { toggle.textContent = 'Petals: off'; toggle.setAttribute('aria-pressed', 'true'); }
toggle.addEventListener('click', () => {
  petals.enabled = !petals.enabled;
  toggle.textContent = 'Petals: ' + (petals.enabled ? 'on' : 'off');
  toggle.setAttribute('aria-pressed', String(!petals.enabled));
});

$('#year').textContent = new Date().getFullYear();

/* ─────────────  13. latest release  ───────────── */

(async () => {
  const repo = 'Praneethreddy-github/bloom';
  const el = {
    win: $('#btn-win'), deb: $('#btn-linux-deb'), app: $('#btn-appimage'),
    winSub: $('#win-sub'), debSub: $('#deb-sub'), ver: $('#dl-version'),
    heroWin: $('#hero-win'), heroLin: $('#hero-linux')
  };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (!res.ok) throw 0;
    const data = await res.json();
    let win = '', deb = '', img = '';
    (data.assets || []).forEach(a => {
      const n = a.name.toLowerCase();
      if (n.endsWith('.exe') && !win) win = a.browser_download_url;
      else if (n.endsWith('.deb') && !deb) deb = a.browser_download_url;
      else if (n.endsWith('.appimage') && !img) img = a.browser_download_url;
    });
    if (win) { el.win.href = win; el.heroWin.href = win; }
    if (deb) { el.deb.href = deb; el.heroLin.href = deb; }
    if (img) el.app.href = img;
    el.ver.textContent = `Latest: ${data.tag_name} · ${new Date(data.published_at).toLocaleDateString()}`;
  } catch { el.ver.textContent = ''; }
})();


/* ─────────────  14. garden network  ─────────────
   Three machines on one network. A packet runs the lit wire between two of them
   and the third never lights — which is the whole claim the section makes, shown
   rather than asserted. Click a peer to send to that one instead. */

(function gardenNet() {
  const wrap = $('#gardenNet');
  if (!wrap) return;

  const W = 620, H = 280, cx = W / 2, cy = H / 2 - 6, R = 96;
  const PEERS = [
    { face: '\u{1F43C}', name: 'priya' },
    { face: '\u{1F989}', name: 'sam' },
    { face: '\u{1F98A}', name: 'alex' }
  ];
  const at = i => {
    const a = -Math.PI / 2 + (i / PEERS.length) * Math.PI * 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };

  const ns = 'http://www.w3.org/2000/svg';
  const el = (n, attrs) => {
    const e = document.createElementNS(ns, n);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  svg.setAttribute('aria-label', 'Three machines on a network, with one private connection lit between two of them');
  wrap.appendChild(svg);

  let target = 0;          // which peer "you" are talking to
  let t = 0;               // packet position along the wire, 0..1
  let raf = null;

  function render() {
    svg.textContent = '';
    svg.appendChild(el('circle', { class: 'gd-orbit', cx, cy, r: R }));

    // Every peer is reachable; only one is being talked to.
    PEERS.forEach((p, i) => {
      const [x, y] = at(i);
      const w = el('line', { class: 'gd-wire' + (i === target ? ' hot' : ''), x1: cx, y1: cy, x2: x, y2: y });
      svg.appendChild(w);
    });

    // You, in the middle.
    const me = el('g', { class: 'gd-peer on' });
    me.appendChild(el('circle', { cx, cy, r: 26 }));
    const meT = el('text', { x: cx, y: cy });
    meT.textContent = '\u{1F980}';
    me.appendChild(meT);
    svg.appendChild(me);
    const meL = el('text', { class: 'gd-label', x: cx, y: cy + 42 });
    meL.textContent = 'you';
    svg.appendChild(meL);

    PEERS.forEach((p, i) => {
      const [x, y] = at(i);
      const g = el('g', { class: 'gd-peer' + (i === target ? ' on' : ''), style: 'cursor:pointer' });
      g.appendChild(el('circle', { cx: x, cy: y, r: 24 }));
      const tx = el('text', { x, y });
      tx.textContent = p.face;
      g.appendChild(tx);
      const lb = el('text', { class: 'gd-label', x, y: y + 40 });
      lb.textContent = p.name;
      g.appendChild(lb);
      g.addEventListener('click', ev => {
        target = i; t = 0;
        if (petals.enabled) petals.burst(ev.clientX, ev.clientY, 7);
        render();
      });
      svg.appendChild(g);
    });

    svg.appendChild(el('circle', { class: 'gd-packet', id: 'gdPacket', cx, cy, r: 3.5 }));
  }

  function tick() {
    t += 0.011;
    if (t > 1) t = 0;
    const dot = svg.querySelector('#gdPacket');
    if (dot) {
      const [x, y] = at(target);
      // Ease so it leaves and arrives gently rather than sliding at a constant rate.
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      dot.setAttribute('cx', cx + (x - cx) * e);
      dot.setAttribute('cy', cy + (y - cy) * e);
      dot.setAttribute('opacity', String(Math.sin(Math.PI * t)));
    }
    raf = requestAnimationFrame(tick);
  }

  render();
  if (reduce) return;   // a packet looping forever is exactly what reduced-motion asks us not to do

  // Don't animate a section nobody has scrolled to yet.
  new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !raf) raf = requestAnimationFrame(tick);
    else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = null; }
  }), { threshold: .15 }).observe(wrap);
})();

})();
