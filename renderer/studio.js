// Bloom Studio: a small image editor opened from the ring (crop, edit, add background, annotate,
// redact, resize, compress, info). Ideas and defaults follow DragShift (MIT); the code is ours.
// The working image is one full-resolution canvas (`doc`); every tool edits it and pushes an undo snapshot.
'use strict';
(async function () {
  const IC = window.BloomIcons;
  const $ = s => document.querySelector(s);
  const cfg = await window.bloom.getConfig();
  const job = await window.bloom.studioLoad();

  // Studio can be opened with nothing in it (from the ring or Settings); a file arrives by drop or the picker.
  const openFile = async file => { const r = await window.bloom.studioOpen(file); if (r.ok) location.reload(); else if (r.error) { const s = document.querySelector('#st-status'); if (s) { s.textContent = r.error; s.className = 'err'; } } };
  $('#st-openbtn').onclick = () => openFile();
  $('#st-emptybtn').onclick = () => openFile();
  window.addEventListener('dragover', e => { e.preventDefault(); $('.st-drop').classList.add('over'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) $('.st-drop').classList.remove('over'); });
  window.addEventListener('drop', e => { e.preventDefault(); $('.st-drop').classList.remove('over'); if (!job.empty) return;   // never swap the file under unsaved edits
    const f = e.dataTransfer.files[0]; const p = f && window.bloom.filePath(f); if (p) openFile(p); });
  if (job.empty) {
    document.body.classList.add('is-empty');
    $('#st-empty').hidden = false;
    $('#st-empty-logo').innerHTML = IC.logo(44, { strokeWidth: 2.4 });
    $('#st-glyph').innerHTML = IC.logo(20, { strokeWidth: 3 });
    $('#st-file').textContent = '';
    $('#st-min').onclick = () => window.bloom.winMin();
    $('#st-max').onclick = () => window.bloom.winMax();
    $('#st-close').onclick = () => window.bloom.winClose();
    return;
  }

  // ---- accent, like the settings window ----
  const hex = (cfg.appearance && cfg.appearance.accentA) || '#007ACC';
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const root = document.documentElement.style;
  root.setProperty('--acc', hex);
  root.setProperty('--acc-weak', `rgba(${rgb.join(',')},0.16)`);
  root.setProperty('--acc-ink', (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6 ? '#0b0b0c' : '#fff');
  $('#st-glyph').innerHTML = IC.logo(20, { strokeWidth: 3 });
  $('#st-file').textContent = job.name;
  $('#st-min').onclick = () => window.bloom.winMin();
  $('#st-max').onclick = () => window.bloom.winMax();
  $('#st-close').onclick = () => window.bloom.winClose();

  if (job.kind === 'pdf') {   // a PDF opens the page editor instead of the image tools
    document.body.classList.add('is-pdf');
    window.StudioPdf.start(job);
    return;
  }

  // ---- document ----
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
  const clone = c => { const o = mk(c.width, c.height); o.getContext('2d').drawImage(c, 0, 0); return o; };
  const bmp = await createImageBitmap(new Blob([job.bytes], { type: job.mime }));
  let doc = mk(bmp.width, bmp.height);
  doc.getContext('2d').drawImage(bmp, 0, 0);
  const original = clone(doc);
  const history = [];
  const snap = () => { history.push(clone(doc)); if (history.length > 25) history.shift(); };
  const set = (c, record = true) => { if (record) snap(); doc = c; refit(); };

  const view = $('#st-view'), over = $('#st-over'), stage = $('#st-stage');
  const vg = view.getContext('2d'), og = over.getContext('2d');
  let scale = 1, dpr = window.devicePixelRatio || 1, shown = null;   // shown: canvas drawn in the view (a preview, or doc)

  function refit() {
    const sw = stage.clientWidth - 40, sh = stage.clientHeight - 40;
    const src = shown || doc;
    scale = Math.min(2, sw / src.width, sh / src.height);
    const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
    for (const c of [view, over]) { c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; }
    redraw();
    $('#st-dims').textContent = `${doc.width} × ${doc.height}`;
  }
  function redraw() {
    vg.clearRect(0, 0, view.width, view.height);
    vg.imageSmoothingQuality = 'high';
    vg.drawImage(shown || doc, 0, 0, view.width, view.height);
    drawOverlay();
  }
  // Tools talk in image pixels; the overlay maps them to the screen.
  const toImg = e => { const r = over.getBoundingClientRect(), k = doc.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  const toScr = (x, y) => ({ x: x * scale * dpr, y: y * scale * dpr });
  const hint = t => { $('#st-hint').textContent = t || ''; };
  const status = (t, kind) => { const s = $('#st-status'); s.textContent = t || ''; s.className = kind || ''; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // A downscaled copy keeps live previews smooth on big photos.
  const previewOf = (c, max = 1000) => { const f = Math.min(1, max / Math.max(c.width, c.height)); const o = mk(c.width * f, c.height * f); const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, o.width, o.height); return o; };

  // ---- panel helpers ----
  const panel = $('#st-panel');
  const sec = (title, ...kids) => { const s = document.createElement('div'); s.className = 'st-sec'; if (title) s.innerHTML = `<h4>${title}</h4>`; kids.forEach(k => s.append(k)); return s; };
  const row = (...kids) => { const r = document.createElement('div'); r.className = 'st-row'; kids.forEach(k => r.append(k)); return r; };
  const btn = (text, fn, cls = 'btn btn-sm') => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.onclick = fn; return b; };
  const pill = (text, fn, on) => { const b = document.createElement('button'); b.className = 'st-pill' + (on ? ' on' : ''); b.textContent = text; b.onclick = () => fn(b); return b; };
  const pills = (items, cur, fn) => { const wrap = document.createElement('div'); wrap.className = 'st-row wrap'; items.forEach(([label, val]) => { const p = pill(label, () => { [...wrap.children].forEach(c => c.classList.remove('on')); p.classList.add('on'); fn(val); }, val === cur); wrap.append(p); }); return wrap; };
  const slider = (label, min, max, val, fn, fmt = v => v) => {
    const r = document.createElement('div'); r.className = 'st-row';
    const l = document.createElement('label'); l.textContent = label;
    const i = Object.assign(document.createElement('input'), { type: 'range', min, max, value: val });
    const o = document.createElement('output'); o.textContent = fmt(val);
    i.oninput = () => { o.textContent = fmt(+i.value); fn(+i.value); };
    r.append(l, i, o);
    r.set = v => { i.value = v; o.textContent = fmt(v); };
    return r;
  };
  const swatches = (list, cur, fn) => {
    const g = document.createElement('div'); g.className = 'st-swatches';
    list.forEach(cols => {
      const s = document.createElement('button'); s.className = 'st-sw';
      s.style.background = cols.length > 1 ? `linear-gradient(135deg, ${cols.join(',')})` : cols[0];
      s.onclick = () => { [...g.children].forEach(c => c.classList.remove('on')); s.classList.add('on'); fn(cols); };
      if (JSON.stringify(cols) === JSON.stringify(cur)) s.classList.add('on');
      g.append(s);
    });
    return g;
  };
  const colorInput = (val, fn) => Object.assign(document.createElement('input'), { type: 'color', value: val, oninput: e => fn(e.target.value) });
  const numInput = (val, fn) => Object.assign(document.createElement('input'), { type: 'number', min: 1, value: val, oninput: e => fn(+e.target.value) });

  // ======================================================================== tools
  const tools = {};
  let cur = null, curName = '';
  const noop = () => {};
  const base = { enter: noop, leave: noop, down: noop, move: noop, up: noop, overlay: noop, commit: noop, dirty: () => false };

  // ---- crop ----
  tools.crop = Object.assign({}, base, (() => {
    let sel, ratio = null, drag = null;
    const RATIOS = [['Free', null], ['Original', 'orig'], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:5', 0.8]];
    let wIn, hIn;
    const reset = () => { sel = { x: 0, y: 0, w: doc.width, h: doc.height }; applyRatio(); };
    const rv = () => ratio === 'orig' ? doc.width / doc.height : ratio;
    function applyRatio() {
      const r = rv();
      if (r) {
        let w = doc.width, h = w / r;
        if (h > doc.height) { h = doc.height; w = h * r; }
        sel = { x: (doc.width - w) / 2, y: (doc.height - h) / 2, w, h };
      }
      sync();
    }
    function sync() { if (wIn) { wIn.value = Math.round(sel.w); hIn.value = Math.round(sel.h); } redraw(); }
    const handles = () => {
      const { x, y, w, h } = sel;
      return { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2] };
    };
    function hit(p) {
      const tol = 14 / scale;
      for (const [k, [hx, hy]] of Object.entries(handles())) if (Math.abs(p.x - hx) < tol && Math.abs(p.y - hy) < tol) return k;
      return p.x > sel.x && p.x < sel.x + sel.w && p.y > sel.y && p.y < sel.y + sel.h ? 'move' : null;
    }
    return {
      enter() {
        reset();
        wIn = numInput(sel.w, v => { sel.w = clamp(v, 1, doc.width - sel.x); if (rv()) sel.h = sel.w / rv(); sync(); });
        hIn = numInput(sel.h, v => { sel.h = clamp(v, 1, doc.height - sel.y); if (rv()) sel.w = sel.h * rv(); sync(); });
        panel.replaceChildren(
          sec('Shape', pills(RATIOS, ratio, v => { ratio = v; applyRatio(); })),
          sec('Size', row(Object.assign(document.createElement('label'), { textContent: 'W × H' }), wIn, hIn)),
          sec('Rotate', row(btn('⟲ 90°', () => rotate(-1)), btn('⟳ 90°', () => rotate(1)))),
          sec(null, btn('Apply crop', () => this.commit(), 'btn btn-primary'), btn('Select all', reset, 'btn btn-sm btn-ghost')));
        hint('Drag the corners or edges, drag inside to move');
        sync();
      },
      down(p) { const k = hit(p); if (k) drag = { k, p, s: { ...sel } }; },
      move(p, e) {
        if (!drag) { over.style.cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' }[hit(p)] || 'crosshair'; return; }
        const dx = p.x - drag.p.x, dy = p.y - drag.p.y, s = drag.s, k = drag.k;
        if (k === 'move') { sel.x = clamp(s.x + dx, 0, doc.width - s.w); sel.y = clamp(s.y + dy, 0, doc.height - s.h); sync(); return; }
        let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
        if (k.includes('w')) x0 = clamp(s.x + dx, 0, x1 - 8);
        if (k.includes('e')) x1 = clamp(s.x + s.w + dx, x0 + 8, doc.width);
        if (k.includes('n')) y0 = clamp(s.y + dy, 0, y1 - 8);
        if (k.includes('s')) y1 = clamp(s.y + s.h + dy, y0 + 8, doc.height);
        const r = rv();
        if (r) {   // keep the ratio: width leads, height follows from the opposite edge
          let w = x1 - x0, h = w / r;
          if (k === 'n' || k === 's') { h = y1 - y0; w = h * r; }
          if (k.includes('n')) y0 = y1 - h; else y1 = y0 + h;
          if (k === 'n' || k === 's') { const cx = (x0 + x1) / 2; x0 = cx - w / 2; x1 = cx + w / 2; }
          else if (k.includes('w')) x0 = x1 - w; else x1 = x0 + w;
          if (x0 < 0 || y0 < 0 || x1 > doc.width || y1 > doc.height) return;
        }
        sel = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        sync();
      },
      up() { drag = null; },
      overlay(g) {
        if (!sel) return;
        const a = toScr(sel.x, sel.y), b = toScr(sel.x + sel.w, sel.y + sel.h);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.beginPath(); g.rect(0, 0, over.width, over.height); g.rect(a.x, a.y, b.x - a.x, b.y - a.y); g.fill('evenodd');
        g.strokeStyle = '#fff'; g.lineWidth = 1.5 * dpr; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = dpr;
        for (let i = 1; i < 3; i++) {
          g.beginPath(); g.moveTo(a.x + (b.x - a.x) * i / 3, a.y); g.lineTo(a.x + (b.x - a.x) * i / 3, b.y); g.moveTo(a.x, a.y + (b.y - a.y) * i / 3); g.lineTo(b.x, a.y + (b.y - a.y) * i / 3); g.stroke();
        }
        g.fillStyle = '#fff';
        for (const [hx, hy] of Object.values(handles())) { const q = toScr(hx, hy); g.fillRect(q.x - 4 * dpr, q.y - 4 * dpr, 8 * dpr, 8 * dpr); }
      },
      commit() {
        const o = mk(sel.w, sel.h);
        o.getContext('2d').drawImage(doc, Math.round(sel.x), Math.round(sel.y), o.width, o.height, 0, 0, o.width, o.height);
        set(o); this.enter();
      },
      dirty: () => false
    };
    function rotate(dir) { const o = mk(doc.height, doc.width), g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate(dir * Math.PI / 2); g.drawImage(doc, -doc.width / 2, -doc.height / 2); set(o); tools.crop.enter(); }
  })());

  // ---- edit (light & colour) ----
  tools.edit = Object.assign({}, base, (() => {
    const P0 = () => ({ b: 0, c: 0, s: 0, w: 0, sh: 0, gray: false });
    let p = P0(), src, sliders = {}, grayBtn, comparing = false;
    function adjust(c, q) {
      const o = mk(c.width, c.height), g = o.getContext('2d');
      g.filter = `brightness(${1 + q.b / 100}) contrast(${1 + q.c / 100}) saturate(${1 + q.s / 100})${q.gray ? ' grayscale(1)' : ''}`;
      g.drawImage(c, 0, 0); g.filter = 'none';
      if (q.w || q.sh) {
        const img = g.getImageData(0, 0, o.width, o.height), d = img.data;
        if (q.sh) {   // unsharp mask: add back the difference from a blurred copy
          const bl = mk(c.width, c.height), bg = bl.getContext('2d'); bg.filter = 'blur(1.2px)'; bg.drawImage(o, 0, 0);
          const bd = bg.getImageData(0, 0, o.width, o.height).data, amt = q.sh / 100 * 1.5;
          for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = clamp(d[i + k] + (d[i + k] - bd[i + k]) * amt, 0, 255);
        }
        const kw = q.w / 100 * 25;
        if (kw) for (let i = 0; i < d.length; i += 4) { d[i] = clamp(d[i] + kw, 0, 255); d[i + 2] = clamp(d[i + 2] - kw, 0, 255); }
        g.putImageData(img, 0, 0);
      }
      return o;
    }
    const dirty = () => JSON.stringify(p) !== JSON.stringify(P0());
    const render = () => { shown = comparing || !dirty() ? src : adjust(src, p); redraw(); };
    function auto() {   // gentle fixes from the histogram, like a phone's "auto"
      const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
      let n = 0, sum = 0, sq = 0, sat = 0;
      for (let i = 0; i < d.length; i += 16) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        sum += l; sq += l * l; sat += mx ? (mx - mn) / mx * 255 : 0; n++;
      }
      const mean = sum / n, std = Math.sqrt(sq / n - mean * mean), sm = sat / n;
      p = Object.assign(P0(), { b: Math.round((clamp(1 + (118 - mean) / 400, 0.85, 1.25) - 1) * 100), c: Math.round((clamp(1 + (58 - std) / 160, 0.95, 1.3) - 1) * 100), s: Math.round((clamp(1 + (110 - sm) / 400, 1, 1.3) - 1) * 100), sh: 15 });
      for (const k of Object.keys(sliders)) sliders[k].set(p[k]);
      render();
    }
    function flip(axis) { const o = mk(doc.width, doc.height), g = o.getContext('2d'); if (axis === 'h') { g.translate(o.width, 0); g.scale(-1, 1); } else { g.translate(0, o.height); g.scale(1, -1); } g.drawImage(doc, 0, 0); set(o); tools.edit.enter(); }
    function rot(dir) { const o = mk(doc.height, doc.width), g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate(dir * Math.PI / 2); g.drawImage(doc, -doc.width / 2, -doc.height / 2); set(o); tools.edit.enter(); }
    return {
      preview: true,
      enter() {
        p = P0(); src = previewOf(doc); shown = src; comparing = false; refit();
        sliders = {};
        const mkS = (label, key) => { const s = slider(label, -100, 100, 0, v => { p[key] = v; render(); }, v => (v > 0 ? '+' : '') + v); sliders[key] = s; return s; };
        grayBtn = pill('Black & white', () => { p.gray = !p.gray; grayBtn.classList.toggle('on', p.gray); render(); });
        const cmp = btn('Hold to compare', noop, 'btn btn-sm btn-ghost');
        cmp.onpointerdown = () => { comparing = true; render(); };
        cmp.onpointerup = cmp.onpointerleave = () => { if (comparing) { comparing = false; render(); } };
        panel.replaceChildren(
          sec('Light & colour', mkS('Brightness', 'b'), mkS('Contrast', 'c'), mkS('Saturation', 's'), mkS('Warmth', 'w'), mkS('Sharpness', 'sh')),
          sec('Quick', row(btn('✦ Auto', auto), grayBtn)),
          sec('Orientation', row(btn('⟲', () => rot(-1)), btn('⟳', () => rot(1)), btn('⇋ Flip', () => flip('h')), btn('⇵ Flip', () => flip('v')))),
          sec(null, btn('Apply', () => this.commit(), 'btn btn-primary'), cmp));
        hint('');
      },
      leave() { shown = null; refit(); },
      commit() { if (!dirty()) return; set(adjust(doc, p)); this.enter(); },
      dirty
    };
  })());

  // ---- add background ----
  tools.bg = Object.assign({}, base, (() => {
    const PRESETS = [['#ff9a5a', '#ff3d6e', '#7b5cff'], ['#2193b0', '#6dd5ed'], ['#00c9a7', '#845ec2'], ['#ffecd2', '#fcb69f'], ['#0f2027', '#2c5364'], ['#ff9a9e', '#fad0c4'], ['#134e5e', '#71b280'], ['#232526', '#414345']];
    const SOLIDS = [['#ffffff'], ['#f4f4f5'], ['#111111'], ['#0b0b0c'], ['#007ACC'], ['#e5484d'], ['#43c98a'], ['#d8a72a']];
    const ASPECTS = ['Auto', '1:1', '4:3', '16:9', '9:16', '4:5'];
    let q, src, touched = false;
    const Q0 = () => ({ cols: PRESETS[0], angle: 135, pad: 12, rad: 24, shadow: 50, aspect: 'Auto' });
    function compose(c, o, k) {   // k scales radius to the image size, like DragShift (radius px per 1000 px)
      const w = c.width, h = c.height, pad = Math.round(Math.max(w, h) * o.pad / 100);
      let cw = w + 2 * pad, ch = h + 2 * pad;
      if (o.aspect !== 'Auto') { const [a, b] = o.aspect.split(':').map(Number), r = a / b; if (cw / ch < r) cw = Math.round(ch * r); else ch = Math.round(cw / r); }
      const out = mk(cw, ch), g = out.getContext('2d');
      if (o.cols.length === 1) g.fillStyle = o.cols[0];
      else {
        const a = (o.angle - 90) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), half = Math.abs(cw * dx) / 2 + Math.abs(ch * dy) / 2;
        const gr = g.createLinearGradient(cw / 2 - dx * half, ch / 2 - dy * half, cw / 2 + dx * half, ch / 2 + dy * half);
        o.cols.forEach((col, i) => gr.addColorStop(i / (o.cols.length - 1), col));
        g.fillStyle = gr;
      }
      g.fillRect(0, 0, cw, ch);
      const r = Math.min(o.rad * k, Math.min(w, h) / 2), x = (cw - w) / 2, y = (ch - h) / 2;
      const layer = mk(w, h), lg = layer.getContext('2d');
      lg.beginPath(); lg.roundRect(0, 0, w, h, r); lg.clip(); lg.drawImage(c, 0, 0);
      if (o.shadow) {
        const blur = Math.max(4, Math.max(w, h) * 0.035);
        g.save(); g.shadowColor = `rgba(0,0,0,${0.65 * o.shadow / 100})`; g.shadowBlur = blur * 1.6; g.shadowOffsetY = blur * 0.6;
        g.drawImage(layer, x, y); g.restore();
      }
      g.drawImage(layer, x, y);
      return out;
    }
    const render = () => { touched = true; shown = compose(src, q, src.width / 1000); refit(); };
    return {
      preview: true,
      enter() {
        q = Q0(); touched = false; src = previewOf(doc, 760); shown = compose(src, q, src.width / 1000); refit();
        const sl = (label, key, min, max, fmt) => slider(label, min, max, q[key], v => { q[key] = v; render(); }, fmt);
        const custom = colorInput('#007ACC', v => { q.cols = [v]; render(); });
        panel.replaceChildren(
          sec('Background', swatches([...PRESETS, ...SOLIDS], q.cols, c => { q.cols = c; render(); }), row(Object.assign(document.createElement('label'), { textContent: 'Custom' }), custom)),
          sec('Look', sl('Padding', 'pad', 0, 40, v => v + '%'), sl('Corners', 'rad', 0, 120, v => v + ' px'), sl('Shadow', 'shadow', 0, 100, v => v + '%'), sl('Angle', 'angle', 0, 360, v => v + '°')),
          sec('Canvas', pills(ASPECTS.map(a => [a, a]), q.aspect, v => { q.aspect = v; render(); })),
          sec(null, btn('Apply background', () => this.commit(), 'btn btn-primary')),
          Object.assign(document.createElement('p'), { className: 'st-note', textContent: 'Best on a transparent PNG: use Remove BG from the ring first.' }));
        hint('');
      },
      leave() { shown = null; refit(); },
      commit() { if (!touched) return; set(compose(doc, q, Math.max(doc.width, doc.height) / 1000)); this.enter(); },
      dirty: () => touched
    };
  })());

  // ---- annotate ----
  tools.annotate = Object.assign({}, base, (() => {
    const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ffffff', '#000000'];
    let kind = 'arrow', color = COLORS[0], width = 4, steps = 1, tmp = null, pending = null;
    const W = () => width * Math.max(doc.width, doc.height) / 1000;
    function draw(g, s) {
      const w = W();
      g.save(); g.strokeStyle = g.fillStyle = s.color; g.lineWidth = w; g.lineCap = g.lineJoin = 'round';
      if (s.kind === 'box') g.strokeRect(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y));
      else if (s.kind === 'arrow') {
        const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x), hl = w * 4.5;
        g.beginPath(); g.moveTo(s.a.x, s.a.y); g.lineTo(s.b.x - Math.cos(ang) * hl * 0.6, s.b.y - Math.sin(ang) * hl * 0.6); g.stroke();
        g.beginPath(); g.moveTo(s.b.x, s.b.y); g.lineTo(s.b.x - hl * Math.cos(ang - 0.45), s.b.y - hl * Math.sin(ang - 0.45)); g.lineTo(s.b.x - hl * Math.cos(ang + 0.45), s.b.y - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill();
      } else if (s.kind === 'marker') {
        g.globalAlpha = 0.4; g.lineWidth = w * 4; g.beginPath(); s.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
      } else if (s.kind === 'step') {
        const r = w * 4; g.beginPath(); g.arc(s.a.x, s.a.y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = s.color === '#ffffff' ? '#000' : '#fff'; g.font = `700 ${r * 1.2}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(s.n), s.a.x, s.a.y + r * 0.06);
      } else if (s.kind === 'text') {
        g.font = `600 ${w * 7}px system-ui`; g.textBaseline = 'top'; g.lineWidth = w * 1.4; g.strokeStyle = s.color === '#000000' ? '#fff' : '#000'; g.globalAlpha = 0.5;
        g.strokeText(s.text, s.a.x, s.a.y); g.globalAlpha = 1; g.fillText(s.text, s.a.x, s.a.y);
      }
      g.restore();
    }
    const commit = s => { snap(); draw(doc.getContext('2d'), s); redraw(); };
    const ti = $('#st-text');
    const finishText = () => { if (pending && ti.value.trim()) commit({ kind: 'text', color, a: pending, text: ti.value }); ti.hidden = true; ti.value = ''; pending = null; };
    ti.onkeydown = e => { if (e.key === 'Enter') finishText(); if (e.key === 'Escape') { ti.hidden = true; pending = null; } e.stopPropagation(); };
    return {
      enter() {
        panel.replaceChildren(
          sec('Tool', pills([['Arrow', 'arrow'], ['Box', 'box'], ['Step', 'step'], ['Text', 'text'], ['Marker', 'marker']], kind, v => { kind = v; })),
          sec('Colour', swatches(COLORS.map(c => [c]), [color], c => { color = c[0]; })),
          sec('Size', slider('Thickness', 1, 14, width, v => { width = v; }, v => v)),
          sec(null, row(btn('Reset steps', () => { steps = 1; }, 'btn btn-sm btn-ghost'))));
        hint('Drag to draw. Each mark is saved straight into the image; Undo removes it.');
      },
      leave() { ti.hidden = true; pending = null; },
      down(p, e) {
        if (kind === 'step') { commit({ kind, color, a: p, n: steps++ }); return; }
        if (kind === 'text') { finishText(); pending = p; const r = stage.getBoundingClientRect(); ti.style.left = (e.clientX - r.left) + 'px'; ti.style.top = (e.clientY - r.top) + 'px'; ti.hidden = false; setTimeout(() => ti.focus(), 0); return; }
        tmp = { kind, color, a: p, b: p, pts: [p] };
      },
      move(p) { if (!tmp) return; tmp.b = p; tmp.pts.push(p); redraw(); },
      up() { if (tmp) { const s = tmp; tmp = null; commit(s); } },
      overlay(g) { if (tmp) { g.save(); g.scale(scale * dpr, scale * dpr); draw(g, tmp); g.restore(); } },
      dirty: () => false
    };
  })());

  // ---- redact ----
  tools.redact = Object.assign({}, base, (() => {
    let mode = 'black', box = null;
    function apply(r) {
      const x = Math.round(Math.min(r.a.x, r.b.x)), y = Math.round(Math.min(r.a.y, r.b.y)), w = Math.round(Math.abs(r.b.x - r.a.x)), h = Math.round(Math.abs(r.b.y - r.a.y));
      if (w < 2 || h < 2) return;
      snap();
      const g = doc.getContext('2d');
      if (mode === 'black') { g.fillStyle = '#000'; g.fillRect(x, y, w, h); }
      else {
        const part = mk(w, h), pg = part.getContext('2d');
        pg.drawImage(doc, x, y, w, h, 0, 0, w, h);
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        if (mode === 'blur') { g.filter = `blur(${Math.max(12, Math.min(w, h) / 3)}px)`; g.drawImage(part, x, y); }
        else { const f = Math.max(8, Math.min(w, h) / 6), sm = mk(Math.max(1, w / f), Math.max(1, h / f)); sm.getContext('2d').drawImage(part, 0, 0, sm.width, sm.height); g.imageSmoothingEnabled = false; g.drawImage(sm, 0, 0, sm.width, sm.height, x, y, w, h); }
        g.restore();
      }
      redraw();
    }
    return {
      enter() {
        panel.replaceChildren(
          sec('Cover with', pills([['Black', 'black'], ['Blur', 'blur'], ['Pixelate', 'pixelate']], mode, v => { mode = v; })),
          Object.assign(document.createElement('p'), { className: 'st-note', textContent: 'Redactions are burned into the pixels of the saved copy. Blur is strong enough that text cannot be recovered.' }));
        hint('Drag a box over anything private');
      },
      down(p) { box = { a: p, b: p }; },
      move(p) { if (box) { box.b = p; redraw(); } },
      up() { if (box) { const b = box; box = null; apply(b); } },
      overlay(g) { if (box) { const a = toScr(box.a.x, box.a.y), b = toScr(box.b.x, box.b.y); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); g.strokeStyle = '#fff'; g.setLineDash([6, 4]); g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); g.setLineDash([]); } },
      dirty: () => false
    };
  })());

  // ---- resize ----
  tools.resize = Object.assign({}, base, (() => {
    let w, h, lock = true, wIn, hIn;
    const ratio = () => doc.width / doc.height;
    const upd = () => { wIn.value = w; hIn.value = h; };
    return {
      enter() {
        w = doc.width; h = doc.height; lock = true;
        wIn = numInput(w, v => { w = Math.max(1, Math.round(v)); if (lock) h = Math.max(1, Math.round(w / ratio())); upd(); });
        hIn = numInput(h, v => { h = Math.max(1, Math.round(v)); if (lock) w = Math.max(1, Math.round(h * ratio())); upd(); });
        const lk = pill('Keep proportions', () => { lock = !lock; lk.classList.toggle('on', lock); }, true);
        const set = (nw, nh) => { w = Math.max(1, Math.round(nw)); h = Math.max(1, Math.round(nh)); upd(); };
        panel.replaceChildren(
          sec('Size in pixels', row(Object.assign(document.createElement('label'), { textContent: 'W × H' }), wIn, hIn), lk),
          sec('Scale', pills([['25%', .25], ['50%', .5], ['75%', .75], ['200%', 2]], null, f => set(doc.width * f, doc.height * f))),
          sec('Fit within', pills([['3840', 3840], ['2560', 2560], ['1920', 1920], ['1280', 1280], ['800', 800], ['512', 512]], null, m => { const f = Math.min(1, m / Math.max(doc.width, doc.height)); set(doc.width * f, doc.height * f); })),
          sec(null, btn('Apply resize', () => this.commit(), 'btn btn-primary')));
        hint('');
      },
      commit() {
        if (w === doc.width && h === doc.height) return;
        const o = mk(w, h), g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(doc, 0, 0, w, h);
        set(o); this.enter();
      },
      dirty: () => false
    };
  })());

  // ---- compress / export ----
  const out = { fmt: ['png', 'jpg', 'webp'].includes(job.ext) ? job.ext : job.ext === 'jpeg' ? 'jpg' : 'png', q: cfg.convert?.quality || 85, mode: 'quality', target: 500000, side: 0 };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  const blobOf = (c, fmt, q) => new Promise(r => c.toBlob(r, MIME[fmt], fmt === 'png' ? undefined : q / 100));
  function fitted(side) {
    if (!side || Math.max(doc.width, doc.height) <= side) return doc;
    const f = side / Math.max(doc.width, doc.height), o = mk(doc.width * f, doc.height * f), g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(doc, 0, 0, o.width, o.height); return o;
  }
  // Binary-search the quality that fits the target, shrinking the picture if even the lowest quality is too big.
  async function encode() {
    let c = fitted(out.side);
    if (out.fmt === 'png' || out.mode === 'quality') return { blob: await blobOf(c, out.fmt, out.q), c };
    for (let round = 0; round < 8; round++) {
      let lo = 30, hi = 92, best = null;
      while (lo <= hi) { const q = (lo + hi) >> 1, b = await blobOf(c, out.fmt, q); if (b.size <= out.target) { best = b; lo = q + 1; } else hi = q - 1; }
      if (best) return { blob: best, c };
      const f = 0.8, o = mk(c.width * f, c.height * f); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); c = o;
      if (Math.max(c.width, c.height) < 200) break;
    }
    return { blob: await blobOf(c, out.fmt, 30), c };
  }
  const human = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  tools.compress = Object.assign({}, base, (() => {
    let est, timer;
    const estimate = () => { clearTimeout(timer); timer = setTimeout(async () => { est.textContent = 'Estimating…'; const r = await encode(); const pct = Math.round((1 - r.blob.size / job.origSize) * 100); est.textContent = `${human(job.origSize)} → ${human(r.blob.size)}` + (pct > 0 ? ` · ${pct}% smaller` : pct < 0 ? ` · ${-pct}% larger` : '') + ` · ${r.c.width}×${r.c.height}`; }, 250); };
    return {
      enter() {
        est = Object.assign(document.createElement('p'), { className: 'st-note' });
        const q = slider('Quality', 10, 95, out.q, v => { out.q = v; estimate(); });
        const t = pills([['2 MB', 2e6], ['1 MB', 1e6], ['500 KB', 5e5], ['200 KB', 2e5], ['100 KB', 1e5]], out.target, v => { out.target = v; estimate(); });
        const modeSec = sec('Mode', pills([['Quality', 'quality'], ['Target size', 'target']], out.mode, v => { out.mode = v; showMode(); estimate(); }), q, t);
        const showMode = () => { modeSec.hidden = out.fmt === 'png'; q.hidden = out.mode !== 'quality'; t.hidden = out.mode !== 'target'; };
        panel.replaceChildren(
          sec('Save as', pills([['JPG', 'jpg'], ['WebP', 'webp'], ['PNG', 'png']], out.fmt, v => { out.fmt = v; showMode(); estimate(); })),
          modeSec,
          sec('Max side', pills([['Original', 0], ['3840', 3840], ['2560', 2560], ['1920', 1920], ['1280', 1280], ['800', 800]], out.side, v => { out.side = v; estimate(); })),
          sec('Result', est),
          Object.assign(document.createElement('p'), { className: 'st-note', textContent: 'PNG is lossless, so quality and target size apply to JPG and WebP. Saved copies never carry EXIF or location data.' }));
        showMode(); estimate(); hint('');
      },
      dirty: () => false
    };
  })());

  // ---- info ----
  tools.info = Object.assign({}, base, {
    enter() {
      const m = job.meta || {}, dl = document.createElement('dl'); dl.className = 'st-table';
      for (const [k, v] of Object.entries(m.fields || {})) dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
      const parts = [sec('File', row(Object.assign(document.createElement('span'), { className: 'st-note', textContent: `${job.name} · ${human(job.origSize)} · ${original.width}×${original.height}` })))];
      parts.push(sec('Metadata', Object.keys(m.fields || {}).length ? dl : Object.assign(document.createElement('p'), { className: 'st-note', textContent: 'No camera, date or location data in this file.' })));
      if (m.gps) parts.push(sec('Location', Object.assign(document.createElement('p'), { className: 'st-note', textContent: `${m.gps.lat.toFixed(5)}, ${m.gps.lon.toFixed(5)}` }), btn('Open on map', () => window.bloom.execute({ id: '__map', type: 'open_url', label: 'Map', params: { urls: [`https://www.openstreetmap.org/?mlat=${m.gps.lat}&mlon=${m.gps.lon}#map=15/${m.gps.lat}/${m.gps.lon}`] } }))));
      const act = [];
      if (m.gps && /^(jpe?g)$/i.test(job.ext)) act.push(btn('Save copy without location', () => runOp('strip-gps'), 'btn btn-sm'));
      act.push(btn('Save copy without any metadata', () => runOp('strip-meta'), 'btn btn-sm'));
      parts.push(sec('Privacy', ...act));
      panel.replaceChildren(...parts); hint('');
    },
    dirty: () => false
  });
  async function runOp(op) { status('Working…'); const r = await window.bloom.studioOp(op); status(r.ok ? r.note : r.error, r.ok ? 'ok' : 'err'); }

  // ---- tool rail ----
  const RAIL = [['crop', 'Crop', 'scissors'], ['edit', 'Edit', 'sliders'], ['bg', 'Add BG', 'palette'], ['annotate', 'Annotate', 'pencil'], ['redact', 'Redact', 'shield'], ['resize', 'Resize', 'trending-up'], ['compress', 'Compress', 'package'], ['info', 'Info', 'tag']];
  RAIL.forEach(([id, label, icon]) => {
    const b = document.createElement('button'); b.className = 'st-tool'; b.dataset.tool = id;
    b.innerHTML = IC.markup(icon, 20) + `<span>${label}</span>`;
    b.onclick = () => choose(id);
    $('#st-tools').append(b);
  });
  function choose(id) {
    if (cur) cur.leave();   // an unapplied preview is dropped; only Apply, Save and Copy keep it
    shown = null; curName = id; cur = tools[id];
    document.querySelectorAll('.st-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
    over.style.cursor = 'crosshair';
    cur.enter(); refit();
  }
  function drawOverlay() { og.clearRect(0, 0, over.width, over.height); if (cur) cur.overlay(og); }

  // ---- pointer ----
  let down = false;
  over.addEventListener('pointerdown', e => { down = true; over.setPointerCapture(e.pointerId); cur && cur.down(toImg(e), e); });
  over.addEventListener('pointermove', e => cur && cur.move(toImg(e), e));
  over.addEventListener('pointerup', e => { if (down) { down = false; cur && cur.up(toImg(e), e); } });

  // ---- bottom bar ----
  function undo() {
    if (!history.length) return;
    doc = history.pop(); shown = null;
    if (cur === tools.crop || cur === tools.resize || cur === tools.edit || cur === tools.bg) cur.enter(); else refit();
  }
  $('#st-undo').onclick = undo;
  $('#st-reset').onclick = () => { snap(); doc = clone(original); shown = null; cur ? cur.enter() : refit(); };
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } if (e.key === 'Escape') window.bloom.winClose(); });
  $('#st-copy').onclick = async () => {
    try { if (cur && cur.dirty()) cur.commit(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blobOf(doc, 'png') })]); status('Copied to clipboard', 'ok'); }
    catch (e) { status('Copy failed: ' + e.message, 'err'); }
  };
  $('#st-save').onclick = async () => {
    try {
      if (cur && cur.dirty()) cur.commit();
      status('Saving…');
      const r = await encode();
      const res = await window.bloom.studioSave({ bytes: await r.blob.arrayBuffer(), ext: out.fmt, edited: history.length > 0 });
      status(res.ok ? res.note : res.error, res.ok ? 'ok' : 'err');
    } catch (e) { status('Save failed: ' + e.message, 'err'); }
  };

  new ResizeObserver(() => refit()).observe(stage);
  choose(tools[job.tool] ? job.tool : 'crop');
})();
