// Bloom Studio, PDF mode: a page grid you can reorder, rotate, delete, duplicate, extract from, and add to.
// Pages are only descriptions ({ src, idx, rot }) until Save, so nothing touches the original file.
'use strict';
window.StudioPdf = {
  start(job) {
    const IC = window.BloomIcons;
    const $ = s => document.querySelector(s);
    const grid = $('#pg-grid'), status = (t, kind) => { const s = $('#st-status'); s.textContent = t || ''; s.className = kind || ''; };
    $('#pg-shell').hidden = false;
    $('#st-savesel').hidden = false;
    $('#st-file').textContent = `${job.name} · ${job.pages} page${job.pages === 1 ? '' : 's'}`;

    let uid = 0, pages = [], sel = new Set(), history = [], last = null, dragIds = null;
    const names = ['']; // source id -> file name, for the "from" badge on pages added later
    const fresh = (src, n) => Array.from({ length: n }, (_, i) => ({ uid: ++uid, src, idx: i, rot: 0 }));
    pages = fresh(0, job.pages);
    const initial = JSON.stringify(pages);
    const snap = () => { history.push(JSON.stringify(pages)); if (history.length > 50) history.shift(); };
    const apply = fn => { snap(); fn(); render(); };

    // ---- thumbnails: fetched lazily, two at a time, cached for the life of the window ----
    const urls = new Map(), queued = new Set(), queue = [];
    let busy = 0;
    const key = p => p.src + ':' + p.idx;
    function pump() {
      while (busy < 2 && queue.length) {
        const p = queue.shift();
        busy++;
        window.bloom.pdfThumb({ src: p.src, index: p.idx, width: 420 }).then(buf => {
          if (buf) urls.set(key(p), URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })));
        }).catch(() => {}).finally(() => { busy--; paintThumbs(); pump(); });
      }
    }
    const want = p => { const k = key(p); if (!urls.has(k) && !queued.has(k)) { queued.add(k); queue.push(p); pump(); } };
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) want(e.target._page); }), { root: grid, rootMargin: '300px' });

    function paintThumbs() {
      grid.querySelectorAll('.pg').forEach(card => {
        const u = urls.get(key(card._page)), th = card.querySelector('.pg-thumb');
        if (!u || th.querySelector('img')) return;
        const img = new Image();
        img.draggable = false;
        img.onload = () => { th.querySelector('.ph')?.remove(); fit(card); };
        img.src = u;
        th.append(img);
      });
    }
    // The thumbnail sits in a box; a quarter turn swaps which side has to fit where.
    function fit(card) {
      const th = card.querySelector('.pg-thumb'), img = th.querySelector('img');
      if (!img) return;
      const turn = ((card._page.rot % 360) + 360) % 360, sideways = turn % 180 !== 0;
      const bw = th.clientWidth, bh = th.clientHeight;
      img.style.maxWidth = (sideways ? bh : bw) + 'px';
      img.style.maxHeight = (sideways ? bw : bh) + 'px';
      img.style.transform = `translate(-50%, -50%) rotate(${turn}deg)`;
    }

    // ---- grid ----
    const pageNo = p => pages.indexOf(p) + 1;
    function render() {
      io.disconnect();
      grid.style.setProperty('--pg', $('#pg-zoom').value + 'px');
      grid.replaceChildren(...pages.map(p => {
        const c = document.createElement('div');
        c.className = 'pg' + (sel.has(p.uid) ? ' on' : '');
        c.draggable = true; c.setAttribute('role', 'option'); c.setAttribute('aria-selected', sel.has(p.uid));
        c._page = p;
        c.innerHTML = `<div class="pg-thumb"><div class="ph"></div></div><span class="pg-n">${pageNo(p)}</span>` +
          (p.src ? `<span class="pg-from">${IC.escapeHTML(names[p.src] || '')}</span>` : '') +
          `<div class="pg-act"><button data-a="l" title="Rotate left">⟲</button><button data-a="r" title="Rotate right">⟳</button><button data-a="x" class="x" title="Delete">✕</button></div>`;
        io.observe(c);
        return c;
      }));
      paintThumbs();
      grid.querySelectorAll('.pg').forEach(fit);
      $('#st-dims').textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}${sel.size ? ` · ${sel.size} selected` : ''}`;
      $('#st-savesel').disabled = !sel.size;
      for (const id of ['#pg-rl', '#pg-rr', '#pg-dup', '#pg-del']) $(id).disabled = !sel.size;
      $('#pg-all').textContent = sel.size === pages.length && pages.length ? 'Select none' : 'Select all';
      $('#st-undo').disabled = !history.length;
    }
    const chosen = () => pages.filter(p => sel.has(p.uid));

    // ---- selection ----
    grid.addEventListener('click', e => {
      const card = e.target.closest('.pg');
      if (!card) { sel.clear(); last = null; render(); return; }
      const p = card._page, act = e.target.closest('button')?.dataset.a;
      if (act) { apply(() => { if (act === 'x') pages = pages.filter(q => q !== p); else p.rot += act === 'r' ? 90 : -90; sel.delete(p.uid); }); return; }
      if (e.shiftKey && last) {
        const a = pages.indexOf(last), b = pages.indexOf(p);
        for (const q of pages.slice(Math.min(a, b), Math.max(a, b) + 1)) sel.add(q.uid);
      } else if (e.ctrlKey || e.metaKey) { sel.has(p.uid) ? sel.delete(p.uid) : sel.add(p.uid); last = p; }
      else { sel = new Set([p.uid]); last = p; }
      render();
    });

    // ---- reorder by dragging (a selected page drags the whole selection) ----
    grid.addEventListener('dragstart', e => {
      const card = e.target.closest('.pg');
      if (!card) return;
      const p = card._page;
      if (!sel.has(p.uid)) { sel = new Set([p.uid]); last = p; }
      dragIds = new Set(sel);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'bloom-pages');
      setTimeout(() => { render(); grid.querySelectorAll('.pg').forEach(c => c.classList.toggle('drag', dragIds && dragIds.has(c._page.uid))); }, 0);
    });
    const clearMarks = () => grid.querySelectorAll('.drop-before, .drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
    const fromOutside = e => !dragIds && [...(e.dataTransfer.types || [])].includes('Files');
    grid.addEventListener('dragover', e => {
      if (fromOutside(e)) { e.preventDefault(); grid.classList.add('filedrop'); }
      if (!dragIds) return;
      e.preventDefault();
      clearMarks();
      const card = e.target.closest('.pg');
      if (!card || dragIds.has(card._page.uid)) return;
      const r = card.getBoundingClientRect();
      card.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
    });
    grid.addEventListener('dragleave', e => { if (!e.relatedTarget || !grid.contains(e.relatedTarget)) grid.classList.remove('filedrop'); });
    grid.addEventListener('drop', e => {
      grid.classList.remove('filedrop');
      if (fromOutside(e)) {   // files dragged in from the file manager: add their pages here
        e.preventDefault();
        const card = e.target.closest('.pg'), files = [...e.dataTransfer.files].map(f => window.bloom.filePath(f)).filter(Boolean);
        let at = null;
        if (card) { const r = card.getBoundingClientRect(); at = pages.indexOf(card._page) + (e.clientX < r.left + r.width / 2 ? 0 : 1); }
        if (files.length) addFrom(window.bloom.pdfAddFiles(files), at);
        return;
      }
      if (!dragIds) return;
      e.preventDefault();
      const card = e.target.closest('.pg');
      const moving = pages.filter(p => dragIds.has(p.uid)), rest = pages.filter(p => !dragIds.has(p.uid));
      let at = rest.length;
      if (card && !dragIds.has(card._page.uid)) {
        const r = card.getBoundingClientRect();
        at = rest.indexOf(card._page) + (e.clientX < r.left + r.width / 2 ? 0 : 1);
      }
      dragIds = null; clearMarks();
      snap(); pages = [...rest.slice(0, at), ...moving, ...rest.slice(at)]; render();
    });
    grid.addEventListener('dragend', () => { dragIds = null; clearMarks(); render(); });

    // ---- toolbar ----
    const turn = d => apply(() => chosen().forEach(p => { p.rot += d; }));
    $('#pg-rl').onclick = () => turn(-90);
    $('#pg-rr').onclick = () => turn(90);
    $('#pg-del').onclick = () => apply(() => { pages = pages.filter(p => !sel.has(p.uid)); sel.clear(); });
    $('#pg-dup').onclick = () => apply(() => {
      const out = [], copies = new Set();
      for (const p of pages) { out.push(p); if (sel.has(p.uid)) { const c = { ...p, uid: ++uid }; out.push(c); copies.add(c.uid); } }
      pages = out; sel = copies;
    });
    $('#pg-all').onclick = () => { sel = sel.size === pages.length ? new Set() : new Set(pages.map(p => p.uid)); render(); };
    $('#pg-zoom').oninput = () => { grid.style.setProperty('--pg', $('#pg-zoom').value + 'px'); grid.querySelectorAll('.pg').forEach(fit); };
    // Pages from picked or dropped files go in at `at` (default: the end), in the order the files came.
    async function addFrom(task, at) {
      const r = await task;
      if (r.errors.length) status(r.errors[0], 'err');
      if (!r.added.length) return;
      const fresh_ = [];
      r.added.forEach(a => { names[a.src] = a.name; fresh_.push(...fresh(a.src, a.pages)); });
      apply(() => { pages.splice(at == null ? pages.length : at, 0, ...fresh_); sel = new Set(fresh_.map(p => p.uid)); });
      if (at == null) grid.scrollTop = grid.scrollHeight;
      if (!r.errors.length) status(`Added ${fresh_.length} page${fresh_.length === 1 ? '' : 's'}`, 'ok');
    }
    $('#pg-add').onclick = () => addFrom(window.bloom.pdfAdd());

    // ---- undo / reset / save ----
    const undo = () => { if (!history.length) return; pages = JSON.parse(history.pop()); sel = new Set([...sel].filter(id => pages.some(p => p.uid === id))); render(); };
    $('#st-undo').onclick = undo;
    $('#st-reset').onclick = () => { if (JSON.stringify(pages) === initial) return; snap(); pages = JSON.parse(initial); sel.clear(); render(); };
    const save = async part => {
      const list = (part ? chosen() : pages).map(p => ({ src: p.src, idx: p.idx, rot: ((p.rot % 360) + 360) % 360 }));
      status('Saving…');
      const r = await window.bloom.pdfSave({ pages: list, part });
      status(r.ok ? r.note : r.error, r.ok ? 'ok' : 'err');
    };
    $('#st-save').onclick = () => save(false);
    $('#st-savesel').onclick = () => save(true);

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(pages.map(p => p.uid)); render(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); $('#pg-del').click(); }
      else if (e.key.toLowerCase() === 'r' && !mod && sel.size) turn(e.shiftKey ? -90 : 90);
      else if (e.key === 'Escape') { if (sel.size) { sel.clear(); render(); } else window.bloom.winClose(); }
    });
    window.addEventListener('resize', () => grid.querySelectorAll('.pg').forEach(fit));
    render();
  }
};
