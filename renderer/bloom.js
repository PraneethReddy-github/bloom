// Bloom overlay engine — bud, layered rings, keyboard nav, palette, toasts.
'use strict';
(async function () {
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), ringsEl = $('#rings'), hud = $('#hud');
  const wiresGuides = $('#wire-guides'), wiresSpokes = $('#wire-spokes'), wiresArcs = $('#wire-arcs');
  const frostEl = $('#frost'), chipEl = $('#chip'), paletteEl = $('#palette');
  const toastsEl = $('#toasts'), ctxEl = $('#ctx'), cheatEl = $('#cheat');
  const IC = window.BloomIcons;
  const TAU = Math.PI * 2;

  let cfg = await window.bloom.getConfig();

  // ---- state ----
  // The bud lives in its own window; this overlay only tracks its center point.
  const state = {
    bud: { x: 0, y: 0 },
    open: false,
    stack: [],           // open rings, root first
    hover: null,         // {ri, ni}
    focus: null,         // {ri, ni}
    chip: { active: false, idx: 0, timer: null },
    toastCount: 0,
    palOpen: false,
    ctxOpen: false,
    cheatOpen: false,
    motion: 1
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = ms => reducedMotion ? 0 : ms / state.motion;

  // test wallpaper (real desktops show true transparency)
  const wp = new URLSearchParams(location.search).get('wallpaper');
  if (wp) { document.body.classList.add('testwall'); document.body.style.backgroundImage = `url(file://${wp})`; }

  // ---- appearance ----
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '94, 234, 212';
  }
  function applyAppearance() {
    const a = cfg.appearance, r = document.documentElement.style;
    r.setProperty('--acc-a', a.accentA); r.setProperty('--acc-b', a.accentB);
    r.setProperty('--acc-a-rgb', hexToRgb(a.accentA)); r.setProperty('--acc-b-rgb', hexToRgb(a.accentB));
    r.setProperty('--blur', (a.reduceTransparency ? 0 : a.blur) + 'px');
    r.setProperty('--hblur', (a.reduceTransparency ? 0 : (a.hoverBlur ?? a.blur + 4)) + 'px');
    r.setProperty('--tint', a.reduceTransparency ? Math.max(a.tint, 0.85) : a.tint);
    r.setProperty('--htint', a.reduceTransparency ? Math.max(a.hoverTint ?? 0.18, 0.9) : (a.hoverTint ?? a.tint + 0.06));
    r.setProperty('--sat', a.saturation + '%');
    r.setProperty('--glow', a.glow);
    r.setProperty('--node', a.nodeSize + 'px');
    r.setProperty('--bud', cfg.bud.size + 'px');
    r.setProperty('--idle-op', cfg.bud.idleOpacity);
    r.setProperty('--dim', a.dim ?? 0.7);
    stage.className = '';
    stage.classList.add(`shape-${a.nodeShape || 'circle'}`, `labels-${a.labelMode || 'hover'}`, `style-${a.ringStyle || 'orbit'}`);
    if (a.flat) stage.classList.add('flat');
    if (a.iconMode === 'mono') stage.classList.add('icons-mono');
    if (!a.grain) stage.classList.add('nograin');
    if (a.reduceTransparency) stage.classList.add('reduce-transparency');
    if (state.open) stage.classList.add('open');
    if (state.palOpen) stage.classList.add('pal');
    for (const [i, stop] of [...document.querySelectorAll('#accgrad stop')].entries()) {
      stop.setAttribute('stop-color', i === 0 ? a.accentA : a.accentB);
    }
    state.motion = a.motionScale || 1;
  }

  // ---- geometry ----
  const W = () => innerWidth, H = () => innerHeight;
  const nodeSize = () => cfg.appearance.nodeSize;
  const R0 = () => cfg.appearance.ringRadius;
  const GAP = () => cfg.appearance.ringGap;
  const budR = () => cfg.bud.size / 2;
  const norm = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const angDiff = (a, b) => norm(a - b);

  // Contiguous angular window at radius r where a node stays fully on-screen, nearest anchor.
  function solveArc(r, anchor) {
    const cx = state.bud.x, cy = state.bud.y;
    const nr = nodeSize() / 2 + 10, top = nr + 8, bot = nr + 34, side = nr + 8;
    const okAt = (a, sideM, vertM) => {
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      return x >= sideM && x <= W() - sideM && y >= vertM && y <= H() - vertM - 26;
    };
    const N = 180, step = TAU / N;
    // full circle needs extra side room for radially-placed labels
    const labelPad = cfg.appearance.labelMode === 'always' ? 58 : 0;
    if (Array.from({ length: N }, (_, i) => okAt(-Math.PI + i * step, side + labelPad, top)).every(Boolean)) {
      return { full: true, start: -Math.PI, len: TAU };
    }
    const ok = Array.from({ length: N }, (_, i) => okAt(-Math.PI + i * step, side, top));
    if (ok.every(Boolean)) return { full: true, start: -Math.PI, len: TAU };
    if (!ok.some(Boolean)) return null;
    // collect circular runs of true
    let s0 = ok.findIndex(v => !v);
    const runs = [];
    let runStart = -1;
    for (let k = 0; k <= N; k++) {
      const i = (s0 + k) % N;
      if (k < N && ok[i]) { if (runStart < 0) runStart = i; }
      else if (runStart >= 0) {
        const len = ((i - runStart + N) % N) || N;
        runs.push({ start: -Math.PI + runStart * step, len: len * step });
        runStart = -1;
      }
    }
    let best = null, bestScore = -1e9;
    for (const run of runs) {
      const mid = run.start + run.len / 2;
      const d = Math.abs(angDiff(anchor, mid));
      const contains = Math.abs(angDiff(anchor, mid)) <= run.len / 2;
      const score = (contains ? 10 : 0) + run.len - d * 1.5;
      if (score > bestScore) { bestScore = score; best = run; }
    }
    return { full: false, start: best.start, len: best.len };
  }

  // Angles for count nodes near anchor from baseR (parent's solved radius + gap, so
  // layers nest outward); bumps radius when the window is too tight for non-overlapping nodes.
  function layoutRing(count, baseR, anchor, isRoot) {
    let r = baseR;
    const maxR = Math.min(W(), H()) * 0.85;
    for (let attempt = 0; attempt < 3; attempt++) {
      const arc = solveArc(r, anchor);
      if (!arc) { r += 40; continue; }
      const minSp = 2 * Math.asin(Math.min(1, (nodeSize() + 18) / (2 * r)));
      let angles = [];
      if (arc.full) {
        if (isRoot) {
          const sp = TAU / count;
          angles = Array.from({ length: count }, (_, i) => norm(-Math.PI / 2 + i * sp));
          return { r, angles, arc, spacing: sp };
        }
        const sp = minSp * 1.16;
        const span = sp * (count - 1);
        angles = Array.from({ length: count }, (_, i) => norm(anchor - span / 2 + i * sp));
        return { r, angles, arc, spacing: sp };
      }
      const usable = arc.len;
      if (isRoot) {
        const sp = usable / count;
        if (sp < minSp * 0.85 && r < maxR) { r = Math.min(maxR, (nodeSize() + 18) / (2 * Math.sin(Math.max(0.02, sp / 2)))); continue; }
        angles = Array.from({ length: count }, (_, i) => norm(arc.start + sp * (i + 0.5)));
        return { r, angles, arc, spacing: sp };
      }
      let sp = minSp * 1.16;
      let span = sp * (count - 1);
      if (span > usable * 0.94) {
        sp = (usable * 0.94) / Math.max(1, count - 1);
        span = sp * (count - 1);
        if (sp < minSp * 0.85 && r < maxR) { r = Math.min(maxR, (nodeSize() + 18) / (2 * Math.sin(Math.max(0.02, sp / 2)))); continue; }
      }
      // clamp the fan's center into the allowed window (wrap-safe via relative angle)
      const rel = angDiff(anchor, arc.start + usable / 2);
      const center = arc.start + usable / 2 + Math.max(-(usable - span) / 2, Math.min((usable - span) / 2, rel));
      angles = Array.from({ length: count }, (_, i) => norm(center - span / 2 + i * sp));
      return { r, angles, arc, spacing: sp };
    }
    // last resort: cram evenly on a full circle
    const sp = TAU / count;
    return { r, angles: Array.from({ length: count }, (_, i) => norm(-Math.PI / 2 + i * sp)), arc: { full: true, start: -Math.PI, len: TAU }, spacing: sp };
  }

  const posAt = (r, a) => ({ x: state.bud.x + r * Math.cos(a), y: state.bud.y + r * Math.sin(a) });

  // Labels sit radially outward from the bud so arc chains never collide.
  // Dial wedges extend past the icon, so labels push further out there.
  function placeLabel(el, a) {
    const lbl = el.querySelector('.nlabel');
    if (!lbl) return;
    const c = Math.cos(a), s = Math.sin(a);
    const out = cfg.appearance.ringStyle === 'dial' ? 24 : 9;
    const outV = cfg.appearance.ringStyle === 'dial' ? 22 : 7;
    lbl.style.left = lbl.style.right = lbl.style.top = lbl.style.bottom = '';
    if (Math.abs(s) > 0.78) {           // mostly vertical → above/below, centered
      lbl.style.left = '50%';
      if (s > 0) lbl.style.top = `calc(100% + ${outV}px)`; else lbl.style.bottom = `calc(100% + ${outV}px)`;
      lbl.style.transform = 'translateX(-50%)';
    } else if (c > 0) {                 // rightward → label to the right
      lbl.style.left = `calc(100% + ${out}px)`;
      lbl.style.top = '50%';
      lbl.style.transform = 'translateY(-50%)';
    } else {                            // leftward → label to the left
      lbl.style.right = `calc(100% + ${out}px)`;
      lbl.style.top = '50%';
      lbl.style.transform = 'translateY(-50%)';
    }
  }

  // ---- ring engine ----
  // At most 4 layers; each open layer stays at its own fixed radius, anchored to its parent's direction.
  const MAX_LAYERS = 4;
  const visibleBase = () => Math.max(0, state.stack.length - MAX_LAYERS);
  const levelOf = ri => ri - visibleBase();
  const enabledChildren = folder => (folder.children || []).filter(n => n.enabled !== false);

  // Telescoping: deepest layer full size, shallower layers shrink toward the bud.
  // _scale is the target, _dscale the displayed value the animator eases toward it.
  const LAYER_SHRINK = 0.2, LAYER_MIN = 0.48;
  const targetScale = ri => Math.max(LAYER_MIN, 1 - ((state.stack.length - 1) - ri) * LAYER_SHRINK);
  const sc = ring => (ring && ring._dscale != null) ? ring._dscale : 1;
  function retargetScales() {
    state.stack.forEach((ring, ri) => {
      ring._scale = targetScale(ri);
      if (ring._dscale == null) ring._dscale = ring._scale; // new layer opens at its target
    });
  }

  // Display radius: innermost visible ring at its telescoped R0; deeper rings packed just outside the previous one.
  const RGAP = () => Math.max(6, cfg.appearance.ringGap * 0.2);
  const dispR = ring => (ring && ring._dispR != null) ? ring._dispR : (ring && ring.layout ? ring.layout.r * sc(ring) : 0);
  function packDisplayRadii() {
    const base = visibleBase();
    let prevOuter = 0;
    for (let ri = base; ri < state.stack.length; ri++) {
      const ring = state.stack[ri];
      if (!ring.layout) continue;
      const half = (nodeSize() / 2 + 12) * sc(ring);
      // innermost keeps its solved radius; deeper rings pack just outside the previous one
      ring._dispR = ri === base ? ring.layout.r * sc(ring) : prevOuter + RGAP() + half;
      prevOuter = ring._dispR + half;
    }
  }
  let scaleRAF = null;
  function animateScales() {
    cancelAnimationFrame(scaleRAF);
    const from = state.stack.map(r => r._dscale);
    const to = state.stack.map(r => r._scale);
    const need = from.some((v, i) => Math.abs(v - to[i]) >= 0.002);
    if (!need) return;   // already at target, don't repaint (keeps birth anim intact)
    if (reducedMotion) {
      state.stack.forEach((r, i) => { r._dscale = to[i]; });
      paintScaled();
      return;
    }
    const D = Math.max(1, dur(220)), t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
      state.stack.forEach((r, i) => { if (from[i] != null) r._dscale = from[i] + (to[i] - from[i]) * e; });
      paintScaled();
      if (p < 1) scaleRAF = requestAnimationFrame(tick);
    };
    scaleRAF = requestAnimationFrame(tick);
  }
  // Repaint transforms + wires at current scale, no layout re-solve (per animation frame).
  function paintScaled() {
    packDisplayRadii();
    const base = visibleBase();
    for (let ri = base; ri < state.stack.length; ri++) {
      const ring = state.stack[ri];
      if (!ring.layout || ring._hidden) continue;
      const s = sc(ring);
      ring.els.forEach((el, i) => {
        if (el.style.display === 'none') return;
        const p = posAt(dispR(ring), ring.layout.angles[i]);
        el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
        el._pos = p;
      });
    }
    drawWires(-1);
    drawHoverArc();
  }

  function makeNodeEl(node, inheritColor) {
    const el = document.createElement('div');
    el.className = 'node';
    const color = node.color || inheritColor;
    if (color) { el.style.setProperty('--na', color); el.style.setProperty('--na-rgb', hexToRgb(color)); }
    const iconSz = Math.round(nodeSize() * 0.5);
    el.innerHTML =
      `<div class="node-glass">${IC.markup(node.icon || 'sparkle', iconSz)}` +
      `<div class="okmark">${IC.markup('check', Math.round(nodeSize() * 0.5))}</div></div>` +
      `<div class="nlabel">${IC.escapeHTML(node.label || '')}</div>`;
    return el;
  }

  function buildRing(folder, anchor, isRoot, parentRi, parentNi) {
    const kids = enabledChildren(folder);
    const items = kids.map(k => ({ node: k }));
    const ring = {
      folder, items, isRoot, parentRi, parentNi, anchor,
      committed: false, els: [], layout: null
    };
    for (const it of items) {
      const el = makeNodeEl(it.node, folder.color);
      ring.els.push(el);
      ringsEl.appendChild(el);
    }
    return ring;
  }

  // Solve angular layout, chaining off the inner ring's radius so corner-grown arcs nest.
  function solveLayout(ring, ri) {
    const level = levelOf(ri);
    const innerRing = level > 0 ? state.stack[ri - 1] : null;
    const baseR = innerRing?.layout ? innerRing.layout.r + GAP() : R0() + level * GAP();
    ring.layout = layoutRing(ring.items.length, baseR, ring.anchor, ring.isRoot);
  }

  function positionRing(ring, animateFrom) {
    const s = sc(ring), lay = ring.layout;
    ring.els.forEach((el, i) => {
      const p = posAt(dispR(ring), lay.angles[i]);
      el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
      el._pos = p; el._angle = lay.angles[i];
      if (animateFrom === 'bloom') {
        el.animate([
          { transform: `translate(${state.bud.x}px, ${state.bud.y}px) scale(${0.6 * s})`, opacity: 0 },
          { transform: `translate(${p.x}px, ${p.y}px) scale(${s})`, opacity: 1 }
        ], { duration: dur(180), delay: dur(i * 7), easing: 'cubic-bezier(0.25, 0.7, 0.3, 1)', fill: 'backwards' });
      }
      el.style.display = '';
    });
  }

  function hideRing(ring) { for (const el of ring.els) el.style.display = 'none'; }
  function destroyRing(ring) { for (const el of ring.els) el.remove(); }

  function refreshVisibility(reason) {
    retargetScales();
    const base = visibleBase();
    const rootBirth = reason === 'open' && state.stack.length === 1;
    for (let ri = 0; ri < state.stack.length; ri++) {
      const ring = state.stack[ri];
      if (ri < base) { if (!ring._hidden) { hideRing(ring); ring._hidden = true; } }
      else { ring._hidden = false; solveLayout(ring, ri); }
    }
    packDisplayRadii();
    for (let ri = base; ri < state.stack.length; ri++) {
      positionRing(state.stack[ri], rootBirth && ri === 0 ? 'bloom' : null);
    }
    drawWires(rootBirth ? 0 : -1);
    renderHUD();
    animateScales();
  }

  // focusFirst lands focus on the new ring's first slot before the draw, so the birth animation survives.
  function openRing(folder, parentRi, parentNi, committed, focusFirst) {
    // hard cap: never open a 5th layer (safety net; editor already forbids folders that deep)
    if (parentRi + 1 >= MAX_LAYERS) return;
    // close anything deeper than the parent
    while (state.stack.length > parentRi + 1) {
      const dead = state.stack.pop();
      destroyRing(dead);
    }
    const parent = state.stack[parentRi];
    const anchor = parent ? parent.els[parentNi]._angle : -Math.PI / 2;
    const ring = buildRing(folder, anchor ?? -Math.PI / 2, false, parentRi, parentNi);
    ring.parentEl = parent ? parent.els[parentNi] : null;
    ring.committed = !!committed;
    state.stack.push(ring);
    if (focusFirst && ring.items.length) {
      state.focus = { ri: state.stack.length - 1, ni: 0 };
      applyFocusClass();
    }
    markTrail();
    refreshVisibility('open');
    syncUI();
  }

  function openRoot(rootFolder) {
    if (state.open) return;
    const folder = rootFolder || cfg.root;
    state.open = true;
    stage.classList.add('open');
    const kids = enabledChildren(folder);
    if (!kids.length) { toast('info', 'Your ring is empty — right-click the bud → Edit Actions'); }
    const ring = buildRing(folder, -Math.PI / 2, true, -1, -1);
    ring.committed = true;
    state.stack.push(ring);
    // focus the first slot right away (visual only, no preview timer)
    if (ring.items.length) { state.focus = { ri: 0, ni: 0 }; applyFocusClass(); }
    refreshVisibility('open');
    openBackdrop();
    syncUI();
  }

  function popRing(via) {
    if (!state.open) return;
    if (state.stack.length <= 1) { closeAll(); return; }
    const dead = state.stack.pop();
    destroyRing(dead);
    // hand focus back to the parent folder without a preview timer (would reopen the closed ring)
    if (via === 'mouse') {
      state.focus = null;
    } else {
      state.focus = dead.parentRi != null ? { ri: dead.parentRi, ni: dead.parentNi } : null;
    }
    markTrail();
    refreshVisibility('pop');
    clearHover();
    syncUI();
    syncFocusVisual();
  }

  function popToDepth(depth) {
    while (state.stack.length > depth + 1) {
      const dead = state.stack.pop();
      destroyRing(dead);
    }
    // keep keyboard focus if it still points at a live ring
    if (state.focus && state.focus.ri >= state.stack.length) state.focus = null;
    markTrail();
    refreshVisibility('pop');
    syncUI();
  }

  function closeAll() {
    if (!state.open) return;
    for (let i = state.stack.length - 1; i >= 0; i--) destroyRing(state.stack[i]);
    state.stack = [];
    state.open = false;
    state.hover = state.focus = null;
    stage.classList.remove('open');
    drawWires(); renderHUD();
    closeBackdrop();
    syncUI();
  }

  function markTrail() {
    state.stack.forEach((ring, ri) => {
      const childRing = state.stack[ri + 1];
      ring.els.forEach((el, ni) => {
        el.classList.toggle('trail', !!childRing && childRing.parentNi === ni);
        el.classList.toggle('dim', !!childRing && childRing.parentNi !== ni && levelOf(ri) >= 0);
      });
    });
    const deepest = state.stack[state.stack.length - 1];
    if (deepest) deepest.els.forEach(el => el.classList.remove('dim'));
  }

  // ---- wires ----
  function arcPath(r, a0, a1) {
    const cx = state.bud.x, cy = state.bud.y;
    const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
    const p1 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  }
  function sectorPath(rIn, rOut, a0_in, a1_in, a0_out, a1_out) {
    const cx = state.bud.x, cy = state.bud.y;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    const largeOut = Math.abs(a1_out - a0_out) > Math.PI ? 1 : 0;
    const largeIn = Math.abs(a1_in - a0_in) > Math.PI ? 1 : 0;
    return `M ${p(rOut, a0_out)} A ${rOut} ${rOut} 0 ${largeOut} 1 ${p(rOut, a1_out)} L ${p(rIn, a1_in)} A ${rIn} ${rIn} 0 ${largeIn} 0 ${p(rIn, a0_in)} Z`;
  }

  // bornRi >= 0: freshly opened ring grows from the bud via rAF on the group's
  // transform attribute — never CSS/WAAPI on this SVG layer (can freeze after hide/show).
  function growFromBud(gEl) {
    if (reducedMotion) return;
    const ox = state.bud.x, oy = state.bud.y;
    const D = Math.max(1, dur(200));
    const t0 = performance.now();
    const tick = now => {
      if (!gEl.isConnected) return;
      const p = Math.min(1, (now - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      const s = 0.25 + 0.75 * e;
      if (p < 1) {
        gEl.setAttribute('transform', `translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`);
        requestAnimationFrame(tick);
      } else gEl.removeAttribute('transform');
    };
    requestAnimationFrame(tick);
  }

  function drawWires(bornRi = -1) {
    wiresGuides.innerHTML = ''; wiresSpokes.innerHTML = '';
    const base = visibleBase();
    const dial = cfg.appearance.ringStyle === 'dial';
    for (let ri = base; ri < state.stack.length; ri++) {
      const ring = state.stack[ri];
      if (!ring.layout || ring._hidden) continue;
      const s = sc(ring);                 // telescoping scale for this layer
      const arc = ring.layout.arc;
      const r = dispR(ring);
      const ns = nodeSize() * s;
      if (dial) {
        // contiguous wedges with a constant parallel physical gap
        const half = ring.layout.spacing / 2;
        const gapPx = 1.5; // half of the 3px total physical gap
        const rIn = r - ns / 2 - 12 * s;
        const rOut = r + ns / 2 + 12 * s;
        const dIn = Math.asin(gapPx / rIn);
        const dOut = Math.asin(gapPx / rOut);
        
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ring.els.forEach((el, i) => {
          const a = ring.layout.angles[i];
          const startA_in = a - half + dIn;
          const endA_in = a + half - dIn;
          const startA_out = a - half + dOut;
          const endA_out = a + half - dOut;
          
          const seg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const cls = el.classList;
          const hot = cls.contains('hot') || cls.contains('kfocus');
          seg.setAttribute('class', 'dial-seg' + (hot ? ' hot' : cls.contains('trail') ? ' trail' : cls.contains('dim') ? ' seg-dim' : ''));
          // Use inner and outer angles for perfectly parallel gaps
          seg.setAttribute('d', sectorPath(rIn, rOut, startA_in, endA_in, startA_out, endA_out));
          const na = getComputedStyle(el).getPropertyValue('--na-rgb').trim() || '94, 234, 212';
          seg.style.setProperty('--seg-rgb', na);
          g.appendChild(seg);
          // folders carry an outer arc to indicate an extra layer
          if (ring.items[i].node.type === 'folder') {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            t.setAttribute('class', 'sub-arc' + (hot || cls.contains('trail') ? ' hot' : ''));
            const inset = 4 * s;
            const rSub = rOut - inset;
            // The outer frame also uses parallel gap inset plus an internal inset
            const subD = Math.asin((gapPx + 2) / rSub);
            t.setAttribute('d', arcPath(rSub, a - half + subD, a + half - subD));
            g.appendChild(t);
          }
        });
        wiresGuides.appendChild(g);
        if (ri === bornRi) growFromBud(g);
      } else {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        g.setAttribute('class', 'ring-guide');
        if (arc.full) {
          g.setAttribute('d', `M ${state.bud.x + r} ${state.bud.y} A ${r} ${r} 0 1 1 ${state.bud.x - r} ${state.bud.y} A ${r} ${r} 0 1 1 ${state.bud.x + r} ${state.bud.y}`);
        } else {
          const pad = 0.07;
          g.setAttribute('d', arcPath(r, ring.layout.angles[0] - pad, ring.layout.angles[ring.layout.angles.length - 1] + pad));
        }
        wiresGuides.appendChild(g);
      }
      if (ring.parentEl && !state.stack[ri - 1]?._hidden) {
        const sp = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        sp.setAttribute('class', 'spoke');
        // in dial mode start at the parent wedge's outer rim, not the icon
        const parent = state.stack[ri - 1];
        const ps = sc(parent);
        const parentR = dispR(parent);
        const pp = dial ? posAt(parentR + nodeSize() / 2 * ps + 13 * ps, ring.anchor) : ring.parentEl._pos;
        const inner = posAt(r - ns / 2 - (dial ? 14 : 8) * s, ring.anchor);
        sp.setAttribute('x1', pp.x); sp.setAttribute('y1', pp.y);
        sp.setAttribute('x2', inner.x); sp.setAttribute('y2', inner.y);
        wiresSpokes.appendChild(sp);
      }
    }
    drawHoverArc();
  }
  function drawHoverArc() {
    wiresArcs.innerHTML = '';
    const tgt = state.hover || state.focus;
    if (!tgt) return;
    const ring = state.stack[tgt.ri];
    if (!ring || ring._hidden || !ring.layout) return;
    const a = ring.layout.angles[tgt.ni];
    const w = Math.min(ring.layout.spacing * 0.42, 0.30);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', 'ring-glow-arc');
    p.setAttribute('d', arcPath(dispR(ring), a - w, a + w));
    wiresArcs.appendChild(p);
  }

  // ---- center readout (HUD) ----
  // Center of the dial shows just the hovered/focused slot's name.
  function renderHUD() {
    if (!state.open) { hud.style.opacity = 0; return; }
    hud.style.opacity = '';
    const tgt = state.hover || state.focus;
    const label = hud.querySelector('.hud-label'), crumbs = hud.querySelector('.crumbs');
    label.textContent = '';
    if (tgt) {
      const it = state.stack[tgt.ri]?.items[tgt.ni];
      if (it) label.textContent = it.node.label || '';
    } else {
      const deepestRing = state.stack[state.stack.length - 1];
      label.textContent = deepestRing && deepestRing.folder && deepestRing.folder.label ? deepestRing.folder.label : 'Bloom';
    }
    // no breadcrumbs in the center, just the name
    if (crumbs) crumbs.innerHTML = '';
    positionHUD();
  }
  function positionHUD() {
    // dead center of the dial, clamped by the label's own size so a short
    // readout stays glued to a corner/edge bud instead of drifting inward
    const r = hud.getBoundingClientRect();
    const halfW = r.width / 2 + 8, halfH = r.height / 2 + 8;
    hud.style.left = Math.max(halfW, Math.min(W() - halfW, state.bud.x)) + 'px';
    hud.style.top = Math.max(halfH, Math.min(H() - halfH, state.bud.y)) + 'px';
  }

  // ---- hover logic ----
  let hoverTimer = null, leaveTimer = null;

  function setHover(ri, ni) {
    const cur = state.hover;
    if (cur && cur.ri === ri && cur.ni === ni) return;
    clearHoverVisual();
    state.hover = ri === null ? null : { ri, ni };
    if (state.hover) {
      const ring = state.stack[ri];
      ring.els[ni].classList.add('hot');
      const it = ring.items[ni];
      clearTimeout(hoverTimer); clearTimeout(leaveTimer);
      // strict layers: a child ring stays open only while its folder (or its contents) is targeted
      const child = state.stack[ri + 1];
      const needsPop = child && child.parentNi !== ni;
      const needsOpen = it.node.type === 'folder' && (!child || child.parentNi !== ni);

      if (needsPop || needsOpen) {
        hoverTimer = setTimeout(() => {
          const currentChild = state.stack[ri + 1];
          if (currentChild && currentChild.parentNi !== ni) popToDepth(ri);
          if (needsOpen) openRing(it.node, ri, ni, false);
        }, 60);
      }
    } else {
      clearTimeout(hoverTimer);
    }
    if (cfg.appearance.ringStyle === 'dial') drawWires(); else drawHoverArc();
    renderHUD();
  }
  function clearHoverVisual() {
    if (state.hover) {
      const r = state.stack[state.hover.ri];
      if (r) r.els[state.hover.ni]?.classList.remove('hot');
    }
  }
  function clearHover() { clearHoverVisual(); state.hover = null; drawHoverArc(); renderHUD(); }

  function hitTest(x, y) {
    const dx = x - state.bud.x, dy = y - state.bud.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    if (dist <= budR() + 8) return { bud: true };
    const base = visibleBase();
    for (let ri = state.stack.length - 1; ri >= base; ri--) {
      const ring = state.stack[ri];
      if (!ring.layout) continue;
      const s = sc(ring);                         // match the scaled visual radius
      if (Math.abs(dist - dispR(ring)) <= (nodeSize() / 2 + 12) * s) {
        const ni = nearestNode(ring, ang);
        if (ni >= 0) return { ri, ni };
        return { none: true };
      }
    }
    return { none: true };
  }
  function nearestNode(ring, ang) {
    let best = -1, bestD = 1e9;
    ring.layout.angles.forEach((a, i) => {
      const d = Math.abs(angDiff(ang, a));
      if (d < bestD) { bestD = d; best = i; }
    });
    return bestD <= Math.max(ring.layout.spacing * 0.5, 0.12) ? best : -1;
  }

  // dedup synthetic mousemoves at the idle cursor position (must not count as real movement)
  let lastMove = null;
  document.addEventListener('mousemove', e => {
    if (lastMove && lastMove.x === e.clientX && lastMove.y === e.clientY) return;
    lastMove = { x: e.clientX, y: e.clientY };
    if (!state.open) return;
    // clear keyboard focus if the user moves the mouse
    if (state.focus) {
      state.focus = null;
      syncFocusVisual();
    }
    const hit = hitTest(e.clientX, e.clientY);
    if (hit.bud || hit.none) setHover(null);
    else setHover(hit.ri, hit.ni);
  });

  // ---- actions ----
  function runNode(node, el) {
    if (node.type === 'folder') return;
    // close instantly, run in the background; failures surface as toasts
    el?.classList.add('flash-ok');
    window.bloom.execute(node);
    setTimeout(() => closeAll(), dur(150));
  }

  function activate(ri, ni, via) {
    const ring = state.stack[ri];
    if (!ring) return;
    const node = ring.items[ni].node;
    if (node.type === 'folder') {
      const child = state.stack[ri + 1];
      if (child && child.parentNi === ni && child.committed) { popToDepth(ri); return; }
      openRing(node, ri, ni, true, via === 'key');
      return;
    }
    runNode(node, ring.els[ni]);
  }

  document.addEventListener('mousedown', e => {
    if (state.palOpen && !paletteEl.contains(e.target)) { closePalette(); return; }
    if (!state.open) return;
    if (e.composedPath().some(el => el.id === 'palette' || el.id === 'ctx' || el.id === 'cheat' || el.id === 'toasts' || (el.classList && el.classList.contains('crumb')))) return;
    if (e.button !== 0) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (hit.bud) { popRing('mouse'); return; } // the drawn bud acts as the back button
    // any click off a wedge and off the bud dismisses, including empty space inside the ring
    if (hit.none) { closeAll(); return; }
    activate(hit.ri, hit.ni, 'mouse');
  });

  // ---- keyboard ----
  function applyFocusClass() {
    document.querySelectorAll('.node.kfocus').forEach(el => el.classList.remove('kfocus'));
    if (state.focus) {
      const ring = state.stack[state.focus.ri];
      ring?.els[state.focus.ni]?.classList.add('kfocus');
    }
  }
  function syncFocusVisual() {
    applyFocusClass();
    if (cfg.appearance.ringStyle === 'dial') drawWires(); else drawHoverArc();
    renderHUD();
  }
  // skipRedraw: the caller just drew the ring, an immediate wedge redraw would wipe its birth animation
  function afterFocusChange(skipRedraw) {
    if (skipRedraw) { renderHUD(); } else syncFocusVisual();
    const f = state.focus;
    if (!f) return;
    const ring = state.stack[f.ri];
    const it = ring?.items[f.ni];
    clearTimeout(hoverTimer);
    // same strict rule as hover: focus off a folder collapses its child, focus on one previews it
    const child = state.stack[f.ri + 1];
    const needsPop = child && child.parentNi !== f.ni;
    const needsOpen = it && it.node?.type === 'folder' && (!child || child.parentNi !== f.ni);

    if (needsPop || needsOpen) {
      hoverTimer = setTimeout(() => {
        const currentChild = state.stack[f.ri + 1];
        if (currentChild && currentChild.parentNi !== f.ni) popToDepth(f.ri);
        if (needsOpen) openRing(it.node, f.ri, f.ni, false);
      }, 60);
    }
  }

  // ←/→ orbit the ring; ↑ steps out into a folder's layer, ↓ steps back. Layers change only on ↑/↓/Enter/Esc.
  function moveFocusCycle(delta) {
    const ri = state.focus?.ri ?? state.stack.length - 1;
    const ring = state.stack[ri];
    if (!ring || !ring.items.length) return;
    let ni = state.focus?.ri === ri ? state.focus.ni : -1;
    ni = ni < 0 ? (delta > 0 ? 0 : ring.items.length - 1) : (ni + delta + ring.items.length) % ring.items.length;
    state.focus = { ri, ni };
    afterFocusChange();
  }

  function focusChild() {
    const f = state.focus;
    if (!f) return;
    const it = state.stack[f.ri]?.items[f.ni];
    if (!it || it.node.type !== 'folder') return;
    clearTimeout(hoverTimer);
    const child = state.stack[f.ri + 1];
    if (!child || child.parentNi !== f.ni) {
      openRing(it.node, f.ri, f.ni, false, true);
      afterFocusChange(true);
    } else if (child.items.length) {
      state.focus = { ri: f.ri + 1, ni: 0 };
      afterFocusChange();
    }
  }

  function focusParent() {
    const f = state.focus;
    if (!f || f.ri === 0) return;
    state.focus = { ri: f.ri - 1, ni: state.stack[f.ri].parentNi };
    afterFocusChange(); // child's folder keeps focus, so the child stays open
  }

  function handleNavKey(k, shift) {
    if (state.cheatOpen) { if (k !== '?') hideCheat(); return true; }
    if (state.palOpen || !state.open) return false;
    if (k === 'ArrowRight') moveFocusCycle(1);
    else if (k === 'ArrowLeft') moveFocusCycle(-1);
    else if (k === 'ArrowUp') focusChild();
    else if (k === 'ArrowDown') focusParent();
    else if (k === 'Tab') moveFocusCycle(shift ? -1 : 1);
    else if (k === 'Enter' || k === ' ') {
      const tgt = state.focus || state.hover;
      if (tgt) activate(tgt.ri, tgt.ni, 'key');
    }
    else if (k === 'Escape' || k === 'Backspace') popRing('key');
    else if (k === 'Home') { popToDepth(0); state.focus = { ri: 0, ni: 0 }; syncFocusVisual(); }
    else if (k === '?') showCheat();
    else if (/^[0-9]$/.test(k)) {
      const ri = state.focus?.ri ?? state.stack.length - 1;
      const ring = state.stack[ri];
      if (!ring) return true;
      const idx = k === '0' ? 9 : +k - 1;
      if (ring.items[idx]) activate(ri, idx, 'key');
    }
    else return false;
    return true;
  }

  window.addEventListener('keydown', e => {
    if (handleNavKey(e.key, e.shiftKey)) e.preventDefault();
  });
  window.bloom.on('bud-key', d => handleNavKey(d.key, d.shift));

  // ---- backdrop ----
  let frostStamp = 0;
  async function openBackdrop() {
    stage.style.setProperty('--ox', state.bud.x + 'px');
    stage.style.setProperty('--oy', state.bud.y + 'px');
    if (cfg.appearance.frost && !cfg.appearance.reduceTransparency) {
      const now = Date.now();
      if (now - frostStamp > 1500) {
        frostStamp = now;
        const shot = await window.bloom.capture();
        if (shot?.dataURL && (state.open || state.palOpen)) {
          frostEl.src = shot.dataURL;
          // place over the display the bud is on (the overlay spans all displays)
          const rc = shot.rect;
          frostEl.style.left = rc.x + 'px'; frostEl.style.top = rc.y + 'px';
          frostEl.style.width = rc.width + 'px'; frostEl.style.height = rc.height + 'px';
          frostEl.classList.add('on');
        }
      } else if (frostEl.src) frostEl.classList.add('on');
    }
  }
  function closeBackdrop() {
    if (!state.open && !state.palOpen) frostEl.classList.remove('on');
  }

  // ---- chip (scroll-cycle) ----
  // Wheel events arrive from the bud window via main ('chip-wheel'/'chip-run').
  function pinnedNodes() {
    return (cfg.pinnedIds || []).map(id => findNode(cfg.root, id)).filter(n => n && n.enabled !== false);
  }
  function chipWheel(dir) {
    const pins = pinnedNodes();
    if (!pins.length || state.open) return;
    const c = state.chip;
    if (!c.active) { c.active = true; c.idx = 0; }
    else c.idx = (c.idx + dir + pins.length) % pins.length;
    renderChip(pins);
    clearTimeout(c.timer);
    c.timer = setTimeout(() => { c.active = false; chipEl.classList.remove('show'); syncUI(); }, 1500);
    syncUI();
  }
  function renderChip(pins) {
    const n = pins[state.chip.idx];
    chipEl.innerHTML =
      IC.markup(n.icon || 'star', 16) +
      `<span class="chip-label">${IC.escapeHTML(n.label || '')}</span>` +
      `<span class="chip-hint">click bud</span>` +
      `<span class="dots">${pins.map((_, i) => `<i class="${i === state.chip.idx ? 'on' : ''}"></i>`).join('')}</span>`;
    chipEl.style.left = state.bud.x + 'px';
    chipEl.style.top = (state.bud.y - budR() - 14) + 'px';
    chipEl.classList.add('show');
  }
  function runChip() {
    const n = pinnedNodes()[state.chip.idx];
    state.chip.active = false;
    chipEl.classList.remove('show');
    if (n) window.bloom.execute(n);
    syncUI();
  }

  // file dropped on the bud → contextual mini-ring (path arrives via main)
  function fileRingFor(p) {
    const dir = p.replace(/[/\\][^/\\]*$/, '') || p;
    const name = p.split(/[/\\]/).pop();
    return {
      id: '__file', type: 'folder', label: name, children: [
        { id: '__f-open', type: 'open_path', label: 'Open', icon: 'file', params: { path: p } },
        { id: '__f-dir', type: 'open_path', label: 'Open Folder', icon: 'folder-open', params: { path: dir } },
        { id: '__f-copy', type: 'snippet', label: 'Copy Path', icon: 'clipboard', params: { text: p, mode: 'copy' } }
      ]
    };
  }

  function findNode(root, id) {
    if (!root || !id) return null;
    if (root.id === id) return root;
    for (const c of root.children || []) { const h = findNode(c, id); if (h) return h; }
    return null;
  }

  // ---- palette ----
  let palIndex = [], palSel = 0, palResults = [];
  function buildPalIndex() {
    const out = [];
    const walk = (n, path) => {
      if (n.enabled === false) return;
      if (n.type === 'folder') { (n.children || []).forEach(c => walk(c, n.id === 'root' ? [] : [...path, n.label])); }
      else out.push({ node: n, crumb: path.join(' › ') });
    };
    walk(cfg.root, []);
    return out;
  }
  function fuzzy(q, s) {
    q = q.toLowerCase(); s = s.toLowerCase();
    let qi = 0, score = 0, streak = 0, marks = [];
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) {
        marks.push(i);
        streak++;
        score += 2 + streak * 2 + (i === 0 || s[i - 1] === ' ' ? 6 : 0) - i * 0.05;
        qi++;
      } else streak = 0;
    }
    return qi === q.length ? { score, marks } : null;
  }
  function openPalette(rect) {
    if (state.palOpen) return;
    if (state.open) closeAll();
    state.palOpen = true;
    stage.classList.add('pal');
    // center on the bud's display (multi-monitor safe), not the display union
    if (rect && rect.width) {
      paletteEl.style.left = Math.round(rect.x + rect.width / 2) + 'px';
      paletteEl.style.top = Math.round(rect.y + rect.height * 0.2) + 'px';
    } else {
      paletteEl.style.left = ''; paletteEl.style.top = '';
    }
    paletteEl.innerHTML =
      `<div class="pal-head">${IC.markup('search', 18)}<input id="pal-input" placeholder="Search every action…" spellcheck="false"></div>` +
      `<ul id="pal-list"></ul>`;
    paletteEl.classList.add('show');
    palIndex = buildPalIndex();
    const input = $('#pal-input');
    input.focus();
    input.addEventListener('input', () => renderPal(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palResults.length - 1, palSel + 1); renderPalSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); execPal(palSel); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    if (rect && rect.width) {
      stage.style.setProperty('--ox', Math.round(rect.x + rect.width / 2) + 'px');
      stage.style.setProperty('--oy', Math.round(rect.y + rect.height * 0.3) + 'px');
    } else { stage.style.setProperty('--ox', '50%'); stage.style.setProperty('--oy', '30%'); }
    openBackdrop();
    renderPal('');
    syncUI();
  }
  function renderPal(q) {
    palSel = 0;
    palResults = !q
      ? palIndex.slice(0, 9).map(x => ({ ...x, marks: [] }))
      : palIndex.map(x => { const m = fuzzy(q, x.node.label || ''); return m ? { ...x, score: m.score, marks: m.marks } : null; })
        .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 40);
    const list = $('#pal-list');
    if (!palResults.length) { list.innerHTML = `<li class="pal-empty">Nothing matches “${IC.escapeHTML(q)}”</li>`; return; }
    list.innerHTML = palResults.map((r, i) => {
      const lbl = r.node.label || '';
      let html = '';
      for (let c = 0; c < lbl.length; c++) html += r.marks.includes(c) ? `<b>${IC.escapeHTML(lbl[c])}</b>` : IC.escapeHTML(lbl[c]);
      return `<li data-i="${i}" class="${i === palSel ? 'sel' : ''}">${IC.markup(r.node.icon || 'sparkle', 17)}` +
        `<span class="pl-label">${html}</span>` +
        `${r.crumb ? `<span class="pl-crumb">${IC.escapeHTML(r.crumb)}</span>` : ''}<span class="pl-go">run ↵</span></li>`;
    }).join('');
    [...list.children].forEach(li => {
      li.addEventListener('mouseenter', () => { palSel = +li.dataset.i; renderPalSel(); });
      li.addEventListener('click', () => execPal(+li.dataset.i));
    });
  }
  function renderPalSel() {
    [...$('#pal-list').children].forEach((li, i) => li.classList.toggle('sel', i === palSel));
    $('#pal-list').children[palSel]?.scrollIntoView({ block: 'nearest' });
  }
  async function execPal(i) {
    const r = palResults[i];
    if (!r) return;
    closePalette();
    const res = await window.bloom.execute(r.node);
    if (res.ok && r.node.type !== 'bloom') toast('ok', r.node.label, 'done');
  }
  function closePalette() {
    state.palOpen = false;
    stage.classList.remove('pal');
    paletteEl.classList.remove('show');
    closeBackdrop();
    syncUI();
  }

  // ---- toasts ----
  function toast(kind, msg, sub, action) {
    const t = document.createElement('div');
    t.className = `toast glass-card ${kind}`;
    t.innerHTML = IC.markup(kind === 'ok' ? 'check' : kind === 'err' ? 'x' : 'sparkle', 16) +
      `<div class="t-msg">${IC.escapeHTML(msg)}${sub ? `<small>${IC.escapeHTML(sub)}</small>` : ''}</div>` +
      (action ? `<button>${IC.escapeHTML(action.label)}</button>` : '');
    if (action) t.querySelector('button').onclick = () => { action.fn(); dismiss(); };
    toastsEl.appendChild(t);
    state.toastCount++;
    syncUI(); // overlay must be visible (click-through) while toasts show
    positionToasts();
    let gone = false;
    const dismiss = () => {
      if (gone) return;
      gone = true;
      t.classList.add('bye');
      setTimeout(() => {
        t.remove(); state.toastCount = Math.max(0, state.toastCount - 1);
        syncUI();
        if (state.toastCount) positionToasts();      // stack shrank — re-hug the bud
      }, 240);
    };
    setTimeout(dismiss, action ? 6200 : 3600);
    while (toastsEl.children.length > 3) { toastsEl.firstChild.remove(); state.toastCount = Math.max(0, state.toastCount - 1); }
  }
  // Toasts hang off the bud itself, not the screen — keep them within arm's
  // reach of it so voice/status feedback reads as coming from the bud.
  const TOAST_GAP = 14;
  function positionToasts() {
    const below = state.bud.y < H() * 0.55;
    const y = below ? state.bud.y + budR() + TOAST_GAP : state.bud.y - budR() - TOAST_GAP - toastsEl.offsetHeight;
    toastsEl.style.left = Math.max(220, Math.min(W() - 220, state.bud.x)) + 'px';
    toastsEl.style.top = Math.max(12, Math.min(H() - toastsEl.offsetHeight - 12, y)) + 'px';
  }

  window.bloom.on('exec-feedback', f => {
    // voice feedback sends its text as `note` even when it failed — don't drop it
    if (!f.ok) toast('err', f.label || 'Action failed', f.error || f.note);
    else if (f.note) toast(f.nodeId ? 'ok' : 'info', f.label || '', f.note);
  });

  // ---- context menu ----
  function showCtx(x, y) {
    state.ctxOpen = true;
    const items = [
      { ic: 'pencil', label: 'Edit Actions', fn: () => window.bloom.openSettings('actions') },
      { ic: 'gear', label: 'Settings', fn: () => window.bloom.openSettings() },
      { ic: 'lock', label: cfg.bud.pinned ? 'Unpin Position' : 'Pin Position', fn: () => window.bloom.patchConfig({ bud: { pinned: !cfg.bud.pinned } }) },
      { sep: true },
      { ic: 'power', label: 'Quit Bloom', fn: () => window.bloom.quit(), danger: true }
    ];
    ctxEl.innerHTML = items.map(it => it.sep ? '<div class="sep"></div>' :
      `<div class="mi${it.danger ? ' danger' : ''}">${IC.markup(it.ic, 15)}<span>${it.label}</span></div>`).join('');
    let mi = 0;
    for (const it of items) {
      if (it.sep) continue;
      ctxEl.querySelectorAll('.mi')[mi++].onclick = () => { hideCtx(); it.fn(); };
    }
    ctxEl.classList.add('show');
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.min(x + 6, W() - r.width - 10) + 'px';
    ctxEl.style.top = Math.min(y + 6, H() - r.height - 10) + 'px';
    syncUI();
    setTimeout(() => document.addEventListener('mousedown', ctxAway, { once: true }), 0);
  }
  function ctxAway(e) { if (!ctxEl.contains(e.target)) hideCtx(); else setTimeout(() => document.addEventListener('mousedown', ctxAway, { once: true }), 0); }
  function hideCtx() { state.ctxOpen = false; ctxEl.classList.remove('show'); syncUI(); }

  // ---- cheat sheet ----
  function showCheat() {
    state.cheatOpen = true;
    const rows = [
      [['←', '→'], 'orbit the ring'],
      [['↑', '↓'], 'step out into / back from a layer'],
      [['Enter'], 'dive into folder / run action'],
      [['Esc'], 'back one layer'],
      [['Home'], 'jump to root'],
      [['1', '–', '9'], 'pick a node directly'],
      [[prettyAccel(cfg.hotkeys.toggleRing)], 'summon ring anywhere'],
      [[prettyAccel(cfg.hotkeys.palette)], 'command palette'],
      [['?'], 'this cheat sheet']
    ];
    cheatEl.innerHTML = `<h3>${IC.markup('keyboard', 17)} Shortcuts</h3>` +
      rows.map(([keys, desc]) =>
        `<div class="krow"><span class="keys">${keys.map(k => k === '–' ? '<span style="opacity:.5">–</span>' : `<kbd>${IC.escapeHTML(k)}</kbd>`).join('')}</span>${desc}</div>`).join('');
    cheatEl.classList.add('show');
    syncUI();
  }
  function hideCheat() { state.cheatOpen = false; cheatEl.classList.remove('show'); syncUI(); }
  function prettyAccel(a) { return (a || '').replace(/Control/g, 'Ctrl').replace(/\+/g, ' '); }

  // ---- ui state sync ----
  function syncUI() {
    window.bloom.uiState({
      ringOpen: state.open,
      uiActive: state.palOpen || state.ctxOpen || state.cheatOpen,
      displayOnly: state.chip.active || state.toastCount > 0
    });
  }

  // ---- main events ----
  window.bloom.on('bud-pos', p => {
    state.bud = p;
    stage.style.setProperty('--ox', p.x + 'px');
    stage.style.setProperty('--oy', p.y + 'px');
    if (state.open) refreshVisibility('resize');
    if (state.chip.active) renderChip(pinnedNodes());
    if (state.toastCount) positionToasts();          // toasts ride along with the bud
  });

  window.bloom.on('summon-ring', d => {
    if (d.budLocal) state.bud = d.budLocal;
    if (state.palOpen) closePalette();
    if (state.open) closeAll();
    if (d.filePath) { openRoot(fileRingFor(d.filePath)); return; }
    openRoot();
  });
  window.bloom.on('close-ring', () => closeAll());
  window.bloom.on('pop-ring', () => popRing());
  window.bloom.on('summon-palette', d => { state.palOpen ? closePalette() : openPalette(d && d.rect); });
  window.bloom.on('show-ctx', () => showCtx(state.bud.x + budR() + 8, state.bud.y + 8));
  window.bloom.on('chip-wheel', d => chipWheel(d.dir));
  window.bloom.on('chip-run', () => { if (state.chip.active) runChip(); });

  window.bloom.on('config-changed', c => {
    cfg = c;
    applyAppearance();
    if (state.open) { // structure may have changed under us
      const reopen = state.stack.length === 1;
      closeAll();
      if (reopen) openRoot();
    }
  });

  window.addEventListener('resize', () => {
    if (state.open) refreshVisibility('resize');
  });

  // ---- boot ----
  applyAppearance();
  renderHUD();
  syncUI();

  // hooks for the CDP test harness
  window.__bloom = {
    state, openRoot, closeAll, popRing, openPalette,
    cfg: () => cfg,
    hit: (x, y) => hitTest(x, y),
    ringInfo: () => state.stack.map(r => ({
      label: r.folder.label, count: r.items.length, r: r.layout?.r,
      angles: r.layout?.angles, hidden: !!r._hidden, committed: r.committed
    }))
  };
})();
