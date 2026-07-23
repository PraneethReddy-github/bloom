// Bloom Settings window — vanilla JS, talks to main via window.bloom (preload).
(function () {
  'use strict';

  const esc = BloomIcons.escapeHTML;
  const icon = BloomIcons.markup;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let cfg = null;
  let currentTab = null;
  let modalOpen = false;
  let midEdit = false; // true while a text input inside a tab is focused

  const TABS = ['actions', 'appearance', 'hotkeys', 'profiles', 'general', 'about'];

  // ---- utils ----
  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function slugId(label) {
    const slug = String(label || 'node').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'node';
    return slug + '-' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function applyAccent(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) hex = '#007ACC';
    const r = document.documentElement.style;
    r.setProperty('--acc', hex);
    r.setProperty('--acc-weak', hexA(hex, 0.16));
    // Text/glyphs sitting ON the accent: white disappears on a light accent.
    r.setProperty('--acc-ink', luma(hex) > 0.6 ? '#0b0b0c' : '#ffffff');
  }

  // relative luminance, 0 (black) – 1 (white)
  function luma(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return 0;
    const [r, g, b] = m.slice(1).map(h => parseInt(h, 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  let selfPatchAt = 0; // suppress echo of our own config-changed events
  let aboutUpdateHandler = null; // set while the About tab is mounted
  async function patch(partial) { selfPatchAt = Date.now(); cfg = await bloom.patchConfig(partial); selfPatchAt = Date.now(); return cfg; }
  async function saveTree() { selfPatchAt = Date.now(); cfg = await bloom.saveTree(cfg.root); selfPatchAt = Date.now(); return cfg; }

  // per-key debounced patch (sliders): preview updates instantly, patch trails.
  const patchTimers = {};
  function debouncedPatch(key, partial, ms) {
    clearTimeout(patchTimers[key]);
    patchTimers[key] = setTimeout(() => { patch(partial); }, ms || 120);
  }

  // ---- tree walking ----
  function walk(node, fn, parent, depth) {
    if (!node) return;
    fn(node, parent || null, depth || 0);
    (node.children || []).forEach(c => walk(c, fn, node, (depth || 0) + 1));
  }
  function findNode(id, root) {
    let hit = null;
    walk(root || cfg.root, n => { if (n.id === id) hit = n; });
    return hit;
  }
  function findParent(id, root) {
    let hit = null;
    walk(root || cfg.root, n => {
      (n.children || []).forEach(c => { if (c.id === id) hit = n; });
    });
    return hit;
  }
  function breadcrumb(id) {
    const path = [];
    (function down(node, trail) {
      if (node.id === id) { path.push(...trail); return true; }
      for (const c of node.children || []) if (down(c, trail.concat(node.label || ''))) return true;
      return false;
    })(cfg.root, []);
    return path.filter(Boolean).slice(1); // drop root label
  }
  function allLeaves() {
    const out = [];
    walk(cfg.root, n => { if (n.type !== 'folder' && n.id !== 'root') out.push(n); });
    return out;
  }

  const TYPE_LABEL = {
    folder: 'Folder', launch_app: 'App', open_url: 'URL', terminal: 'Terminal',
    system_toggle: 'Toggle', media: 'Media', snippet: 'Snippet', macro: 'Macro',
    script: 'Script', webhook: 'Webhook', open_path: 'Path', bloom: 'Bloom'
  };

  // ---- toasts ----
  function toast(msg, opts) {
    opts = opts || {};
    const wrap = $('#toasts');
    while (wrap.children.length >= 3) wrap.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ' ' + opts.kind : '');
    const ic = opts.kind === 'bad' ? 'x' : (opts.kind === 'ok' ? 'check' : 'sparkle');
    el.innerHTML = `${icon(ic, 15)}<span>${esc(msg)}</span>`;
    if (opts.undo) {
      const b = document.createElement('button');
      b.className = 'undo-btn';
      b.textContent = 'Undo';
      b.addEventListener('click', () => { dismiss(); opts.undo(); });
      el.appendChild(b);
    }
    wrap.appendChild(el);
    let gone = false;
    function dismiss() {
      if (gone) return; gone = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 210);
    }
    setTimeout(dismiss, opts.undo ? 6000 : 4000);
    return dismiss;
  }

  // ---- modal ----
  function openModal(html, opts) {
    opts = opts || {};
    modalOpen = true;
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(back);
    const modal = back.firstElementChild;
    function close() {
      modalOpen = false;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape' && !capturing) { e.stopPropagation(); close(); }
    }
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', e => { if (e.target === back && !opts.noBackdropClose) close(); });
    const first = modal.querySelector('input, select, textarea, button');
    if (first) setTimeout(() => first.focus(), 30);
    return { modal, close };
  }

  function confirmModal(title, body, confirmLabel, danger) {
    return new Promise(resolve => {
      const { modal, close } = openModal(`
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body"><p style="color:var(--muted)">${esc(body)}</p></div>
        <div class="modal-foot">
          <span class="spring"></span>
          <button class="btn" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmLabel || 'Confirm')}</button>
        </div>`, { onClose: () => resolve(false) });
      $('[data-act=cancel]', modal).addEventListener('click', () => { close(); });
      $('[data-act=ok]', modal).addEventListener('click', () => { resolve(true); close(); });
    });
  }

  // ---- tabs ----
  function switchTab(tab, opts) {
    if (!TABS.includes(tab)) return;
    currentTab = tab;
    localStorage.setItem('bloom-settings-tab', tab);
    $$('.rail-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    TABS.forEach(t => { $('#tab-' + t).hidden = t !== tab; });
    renderTab(tab);
    if (!opts || !opts.noFocus) $('#content').scrollTop = 0;
  }

  function renderTab(tab) {
    const pane = $('#tab-' + tab);
    if (tab === 'actions') renderActions(pane);
    else if (tab === 'appearance') renderAppearance(pane);
    else if (tab === 'hotkeys') renderHotkeys(pane);
    else if (tab === 'profiles') renderProfiles(pane);
    else if (tab === 'general') renderGeneral(pane);
    else if (tab === 'about') renderAbout(pane);
    // restart the enter animation
    pane.style.animation = 'none';
    void pane.offsetWidth;
    pane.style.animation = '';
  }

  function rerenderCurrent() {
    if (modalOpen || midEdit || capturing) return;
    renderTab(currentTab);
  }

  function flashControl(el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  }

  // ---- global search ----
  // Static registry: keyword match jumps to a tab + data-sid element.
  const CONTROL_INDEX = [
    { tab: 'appearance', sid: 'accents', label: 'Accent color', kw: 'accent color highlight blue' },
    { tab: 'appearance', sid: 'dim', label: 'Backdrop dim', kw: 'dim darken backdrop vignette background' },
    { tab: 'appearance', sid: 'nodeSize', label: 'Wedge size', kw: 'wedge node size dial thickness' },
    { tab: 'appearance', sid: 'ringRadius', label: 'Dial radius', kw: 'dial ring radius spacing distance' },
    { tab: 'appearance', sid: 'ringGap', label: 'Layer gap', kw: 'ring layer gap spacing nested' },
    { tab: 'appearance', sid: 'budSize', label: 'Bud size', kw: 'bud size diameter' },
    { tab: 'appearance', sid: 'budOpacity', label: 'Bud idle opacity', kw: 'bud idle opacity transparency' },
    { tab: 'appearance', sid: 'motionScale', label: 'Motion speed', kw: 'motion speed animation slow fast reduce' },
    { tab: 'hotkeys', sid: 'hk-ring', label: 'Summon ring hotkey', kw: 'hotkey summon ring shortcut global open menu' },
    { tab: 'hotkeys', sid: 'hk-palette', label: 'Command palette hotkey', kw: 'hotkey palette command search shortcut' },
    { tab: 'hotkeys', sid: 'quickfire', label: 'Quick-fire hotkeys', kw: 'quickfire quick fire action hotkey direct' },
    { tab: 'hotkeys', sid: 'hoverOpenDelay', label: 'Hover open delay', kw: 'hover delay sub ring open folder' },
    { tab: 'hotkeys', sid: 'dblAction', label: 'Double-tap & hold actions', kw: 'double tap hold favourite favorite dictate read aloud voice gesture speech' },
    { tab: 'hotkeys', sid: 'scrollCycle', label: 'Scroll cycles pinned', kw: 'scroll wheel cycle pinned bud' },
    { tab: 'hotkeys', sid: 'edgeSnap', label: 'Edge snap', kw: 'edge snap screen bud position' },
    { tab: 'hotkeys', sid: 'budPinned', label: 'Pin bud position', kw: 'pin bud position lock drag' },
    { tab: 'hotkeys', sid: 'cheat', label: 'Ring shortcuts cheat sheet', kw: 'cheat sheet shortcuts keyboard ring keys' },
    { tab: 'hotkeys', sid: 'dblFav', label: 'Double-tap favourite', kw: 'favourite favorite double tap star action' },
    { tab: 'hotkeys', sid: 'holdFav', label: 'Hold favourite', kw: 'favourite favorite hold long press star action' },
    { tab: 'hotkeys', sid: 'voModel', label: 'Speech-to-text model', kw: 'voice whisper model dictation accuracy language speech' },
    { tab: 'hotkeys', sid: 'voVoice', label: 'Read-aloud voice', kw: 'voice tts text to speech read aloud speaker' },
    { tab: 'hotkeys', sid: 'voRate', label: 'Read-aloud speed', kw: 'voice tts rate speed read aloud faster slower' },
    { tab: 'profiles', sid: 'profiles-list', label: 'Profiles', kw: 'profile switch work gaming presentation save' },
    { tab: 'general', sid: 'autostart', label: 'Launch at login', kw: 'autostart login startup launch boot' },
    { tab: 'general', sid: 'showOnStartup', label: 'Show bud on start', kw: 'show bud start startup visible' },
    { tab: 'general', sid: 'export', label: 'Export configuration', kw: 'export backup config json save' },
    { tab: 'general', sid: 'import', label: 'Import configuration', kw: 'import restore config json load' },
    { tab: 'general', sid: 'reset', label: 'Reset to defaults', kw: 'reset defaults danger wipe factory' },
    { tab: 'about', sid: 'about-card', label: 'About Bloom', kw: 'about version updates onboarding replay cheat' },
    { tab: 'about', sid: 'updates', label: 'Software update', kw: 'update check download install channel stable beta version' }
  ];

  function globalSearchResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    // actions
    walk(cfg.root, n => {
      if (n.id === 'root') return;
      if ((n.label || '').toLowerCase().includes(q)) {
        out.push({
          kind: 'action', icon: n.icon || 'sparkle', label: n.label || n.id,
          sub: ['Actions'].concat(breadcrumb(n.id)).join(' › '), id: n.id
        });
      }
    });
    // controls
    for (const c of CONTROL_INDEX) {
      if (c.label.toLowerCase().includes(q) || c.kw.includes(q)) {
        out.push({ kind: 'control', icon: 'gear', label: c.label, sub: tabTitle(c.tab), tab: c.tab, sid: c.sid });
      }
    }
    // hotkey names (accelerator text)
    const hk = [
      { name: 'Summon ring', acc: cfg.hotkeys.toggleRing, sid: 'hk-ring' },
      { name: 'Command palette', acc: cfg.hotkeys.palette, sid: 'hk-palette' }
    ];
    for (const [nodeId, acc] of Object.entries(cfg.quickfire || {})) {
      const n = findNode(nodeId);
      hk.push({ name: 'Quick-fire: ' + (n ? n.label : nodeId), acc, sid: 'quickfire' });
    }
    for (const h of hk) {
      if ((h.acc || '').toLowerCase().includes(q) || h.name.toLowerCase().includes(q)) {
        if (!out.some(o => o.kind === 'control' && o.sid === h.sid)) {
          out.push({ kind: 'control', icon: 'keyboard', label: h.name + ' — ' + (h.acc || 'unset'), sub: 'Hotkeys & Input', tab: 'hotkeys', sid: h.sid });
        }
      }
    }
    return out.slice(0, 14);
  }

  function tabTitle(t) {
    return { actions: 'Actions', appearance: 'Appearance', hotkeys: 'Hotkeys & Input', profiles: 'Profiles', general: 'General & Startup', about: 'About & Updates' }[t] || t;
  }

  function jumpToResult(r) {
    if (r.kind === 'action') {
      const n = findNode(r.id);
      treeFilter = n ? (n.label || '') : '';
      switchTab('actions'); // renderActions picks up treeFilter for both input & tree
      const row = $(`.tree-row[data-id="${CSS.escape(r.id)}"]`);
      if (row) flashControl(row);
    } else {
      switchTab(r.tab);
      const el = $(`[data-sid="${CSS.escape(r.sid)}"]`);
      if (el) flashControl(el);
    }
  }

  function setupGlobalSearch() {
    const input = $('#global-search');
    const results = $('#gs-results');
    let items = [];
    let sel = -1;

    function renderResults() {
      if (!items.length) {
        if (input.value.trim()) {
          results.hidden = false;
          results.innerHTML = `<div class="gs-empty">No matches</div>`;
        } else results.hidden = true;
        return;
      }
      results.hidden = false;
      results.innerHTML = items.map((r, i) => `
        <button class="gs-item ${i === sel ? 'sel' : ''}" data-i="${i}" role="option">
          ${icon(r.icon, 16)}
          <span class="gs-item-text">
            <div class="gs-item-label">${esc(r.label)}</div>
            <div class="gs-item-sub">${esc(r.sub)}</div>
          </span>
          <span class="gs-kind">${r.kind === 'action' ? 'Action' : 'Setting'}</span>
        </button>`).join('');
      $$('.gs-item', results).forEach(b => b.addEventListener('click', () => pick(+b.dataset.i)));
    }
    function pick(i) {
      const r = items[i];
      if (!r) return;
      results.hidden = true;
      input.value = '';
      jumpToResult(r);
    }
    input.addEventListener('input', () => { items = globalSearchResults(input.value); sel = items.length ? 0 : -1; renderResults(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); renderResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); renderResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
      else if (e.key === 'Escape') { results.hidden = true; input.blur(); }
    });
    document.addEventListener('mousedown', e => {
      if (!$('#global-search-wrap').contains(e.target)) results.hidden = true;
    });
  }

  // ---- mid-edit tracking ----
  document.addEventListener('focusin', e => {
    if (e.target.matches('#content input[type=text], #content input:not([type]), #content textarea')) midEdit = true;
  });
  document.addEventListener('focusout', () => { setTimeout(() => {
    const a = document.activeElement;
    midEdit = !!(a && a.closest && a.closest('#content') && a.matches('input[type=text], input:not([type]), textarea'));
  }, 0); });

  let capturing = false; // set by hotkey capture

  // ==== ACTIONS TAB ====
  const collapsed = new Set();
  let treeFilter = '';
  let selectedRowId = null;
  let undoStash = null;
  let dragState = null; // {id, overId, pos:'before'|'after'|'into'}

  const SOFT_CAP = 8, HARD_CAP = 12;

  function renderActions(pane) {
    pane.innerHTML = `
      <h1>Actions</h1>
      <p class="tab-desc">The tree of actions your bud opens into. Drag the grip to reorder, or drop onto a folder to nest.</p>
      <div class="actions-toolbar">
        <div class="search-wrap">
          <span class="ic-in">${icon('search', 14)}</span>
          <input id="actions-search" class="in" type="text" placeholder="Filter actions…" aria-label="Filter actions" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="add-action">${icon('plus', 14)} Add action</button>
        <button class="btn" id="add-folder">${icon('folder', 14)} Add folder</button>
        <button class="btn btn-ghost btn-sm" id="expand-all" title="Expand all">${icon('chevron-down', 13)}</button>
        <button class="btn btn-ghost btn-sm" id="collapse-all" title="Collapse all">${icon('chevron-up', 13)}</button>
      </div>
      <div class="tree-legend">
        <span class="lg-star lg-dbl">${icon('star', 13)} Runs on double-tap of the bud</span>
        <span class="lg-star lg-hold">${icon('hold', 13)} Runs on hold of the bud</span>
        <span class="lg-tgl"><span class="lg-knob"></span> Enabled — off hides it from the ring</span>
      </div>
      <div id="tree" role="tree" aria-label="Action tree"></div>`;

    const search = $('#actions-search', pane);
    search.value = treeFilter;
    search.addEventListener('input', debounce(() => { treeFilter = search.value; renderTree(); }, 80));
    $('#add-action', pane).addEventListener('click', () => openWizard(null, addTargetId()));
    $('#add-folder', pane).addEventListener('click', () => quickAddFolder());
    $('#expand-all', pane).addEventListener('click', () => { collapsed.clear(); renderTree(); });
    $('#collapse-all', pane).addEventListener('click', () => {
      walk(cfg.root, n => { if (n.type === 'folder' && n.id !== 'root') collapsed.add(n.id); });
      renderTree();
    });
    renderTree();
  }

  function addTargetId() {
    const sel = selectedRowId && findNode(selectedRowId);
    return sel && sel.type === 'folder' ? sel.id : 'root';
  }

  function quickAddFolder() {
    const target = findNode(addTargetId());
    if (!capOk(target)) return;
    if (!canAddFolderIn(target)) { toast(`Bloom rings go 4 layers deep — “${target.label || 'this folder'}” can’t hold another folder.`, { kind: 'bad' }); return; }
    const node = { id: slugId('folder'), type: 'folder', label: 'New Folder', icon: 'folder', enabled: true, children: [] };
    target.children = target.children || [];
    target.children.push(node);
    collapsed.delete(target.id);
    saveTree().then(() => { renderTree(); startInlineRename(node.id); });
  }

  function capOk(folder, silent) {
    const n = (folder.children || []).length;
    if (n >= HARD_CAP) {
      if (!silent) toast(`"${folder.label}" is full — rings hard-cap at ${HARD_CAP} items.`, { kind: 'bad' });
      return false;
    }
    return true;
  }

  // Rings are max 4 layers deep, so folders are allowed only at depth 1–3.
  const MAX_FOLDER_DEPTH = 3;
  function depthOf(id) {
    let d = 0;
    walk(cfg.root, (n, _p, depth) => { if (n.id === id) d = depth; });
    return d;
  }
  // Deepest folder depth within node (node = 0); -1 if it holds no folders.
  function folderSpan(node) {
    let max = node && node.type === 'folder' ? 0 : -1;
    for (const c of (node && node.children) || []) {
      const sub = folderSpan(c);
      if (sub >= 0) max = Math.max(max, 1 + sub);
    }
    return max;
  }
  // True if src can nest under parent without exceeding the 4-layer cap.
  function layerOk(src, parent, silent) {
    const span = folderSpan(src);
    if (span < 0) return true; // no folders in it
    const deepest = depthOf(parent.id) + 1 + span;
    if (deepest > MAX_FOLDER_DEPTH) {
      if (!silent) toast(`Bloom rings go 4 layers deep — “${parent.label || 'this folder'}” can’t hold another folder.`, { kind: 'bad' });
      return false;
    }
    return true;
  }
  const canAddFolderIn = folder => depthOf(folder.id) + 1 <= MAX_FOLDER_DEPTH;

  function rowHTML(node, depth, crumb) {
    const isFolder = node.type === 'folder';
    const disabled = node.enabled === false;
    const fav = favKindOf(node.id);                  // '' | 'dbl' | 'hold'
    const isPinned = (cfg.pinnedIds || []).includes(node.id);
    const color = node.color ? ` style="color:${esc(node.color)}"` : '';
    return `
      <div class="tree-row ${disabled ? 'row-disabled' : ''}" data-id="${esc(node.id)}" role="treeitem" tabindex="-1"
           aria-label="${esc(node.label || node.id)}"
           ${isFolder ? `aria-expanded="${!collapsed.has(node.id)}"` : ''}>
        <span class="tr-handle" title="Drag to move" draggable="true">${icon('drag', 14)}</span>
        ${isFolder
          ? `<button class="tr-chev ${collapsed.has(node.id) ? '' : 'open'}" aria-label="Toggle folder" tabindex="-1">${icon('chevron-right', 13)}</button>`
          : `<span class="tr-chev-spacer"></span>`}
        <span class="tr-icon"${color}>${icon(node.icon, 18)}</span>
        <span class="tr-label">${esc(node.label || node.id)}</span>
        ${crumb ? `<span class="tr-crumb">${esc(crumb)}</span>` : ''}
        <span class="tr-chip">${esc(TYPE_LABEL[node.type] || node.type)}</span>
        <span class="tr-spring"></span>
        <span class="tr-cluster">
          <button class="icon-btn" data-act="edit" title="Edit" aria-label="Edit">${icon('pencil', 14)}</button>
          <button class="icon-btn" data-act="dup" title="Duplicate" aria-label="Duplicate">${icon('clipboard', 14)}</button>
          <button class="icon-btn danger" data-act="del" title="Delete" aria-label="Delete">${icon('trash', 14)}</button>
          <button class="icon-btn" data-act="up" title="Move up" aria-label="Move up">${icon('chevron-up', 14)}</button>
          <button class="icon-btn" data-act="down" title="Move down" aria-label="Move down">${icon('chevron-down', 14)}</button>
        </span>
        <span class="tr-fixed">
          <button class="icon-btn fav-btn fav-dbl ${fav === 'dbl' ? 'fav-on' : ''}" data-act="star"
                  title="${fav === 'dbl' ? 'Double-tap favourite — click to clear' : 'Make this the double-tap favourite'}"
                  aria-label="Double-tap favourite" aria-pressed="${fav === 'dbl'}">${icon('star', 14)}</button>
          <button class="icon-btn fav-btn fav-hold ${fav === 'hold' ? 'fav-on' : ''}" data-act="holdfav"
                  title="${fav === 'hold' ? 'Hold favourite — click to clear' : 'Make this the hold favourite'}"
                  aria-label="Hold favourite" aria-pressed="${fav === 'hold'}">${icon('hold', 14)}</button>
          <label class="tgl" title="${disabled ? 'Enable' : 'Disable'}">
            <input type="checkbox" data-act="enable" ${disabled ? '' : 'checked'} aria-label="Enabled" tabindex="-1">
            <span class="knob"></span>
          </label>
        </span>
      </div>`;
  }

  function renderTree() {
    const tree = $('#tree');
    if (!tree) return;
    const q = treeFilter.trim().toLowerCase();
    let html = '';

    if (q) {
      const matches = [];
      walk(cfg.root, n => {
        if (n.id !== 'root' && (n.label || '').toLowerCase().includes(q)) matches.push(n);
      });
      html = matches.length
        ? matches.map(n => rowHTML(n, 0, breadcrumb(n.id).join(' › '))).join('')
        : `<div class="empty-state">${icon('search', 30)}<p>No actions match "${esc(treeFilter)}"</p></div>`;
    } else if (!(cfg.root.children || []).length) {
      html = `<div class="empty-state">${icon('bloom', 34)}<p>Nothing here yet — add your first action to start blooming.</p></div>`;
    } else {
      html = (cfg.root.children || []).map(c => branchHTML(c, 0)).join('');
    }
    tree.innerHTML = html;
    wireTree(tree, !!q);
  }

  function branchHTML(node, depth) {
    let out = rowHTML(node, depth, '');
    if (node.type === 'folder') {
      const kids = node.children || [];
      let warn = '';
      if (kids.length > SOFT_CAP) {
        warn = `<div class="cap-chip ${kids.length >= HARD_CAP ? 'block' : ''}">${icon('sparkle', 12)}
          ${kids.length >= HARD_CAP ? `Ring is at the hard cap of ${HARD_CAP}.` : `Rings feel best under ${SOFT_CAP} — group into a folder?`}</div>`;
      }
      out += `<div class="tree-children ${collapsed.has(node.id) ? 'collapsed' : ''}" data-parent="${esc(node.id)}">
        ${warn}${kids.map(k => branchHTML(k, depth + 1)).join('')}</div>`;
    }
    return out;
  }

  function wireTree(tree, filtered) {
    const rows = $$('.tree-row', tree);
    rows.forEach((row, i) => {
      const id = row.dataset.id;
      row.tabIndex = i === 0 ? 0 : -1;
      row.addEventListener('click', e => {
        if (e.target.closest('button, label, input')) return;
        selectRow(id);
        row.focus();
      });
      const chev = $('.tr-chev', row);
      if (chev && chev.tagName === 'BUTTON') chev.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(id); });
      row.addEventListener('dblclick', e => { if (!e.target.closest('button, label, input')) openWizard(id); });

      $$('[data-act]', row).forEach(btn => {
        const act = btn.dataset.act;
        if (act === 'enable') {
          btn.addEventListener('change', () => setEnabled(id, btn.checked));
          return;
        }
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (act === 'edit') openWizard(id);
          else if (act === 'dup') duplicateNode(id);
          else if (act === 'del') deleteNode(id);
          else if (act === 'up') moveNode(id, -1);
          else if (act === 'down') moveNode(id, +1);
          else if (act === 'star') toggleFavorite(id, 'dbl');
          else if (act === 'holdfav') toggleFavorite(id, 'hold');
          else if (act === 'pin') togglePin(id);
        });
      });

      row.addEventListener('keydown', e => onRowKey(e, row, rows));
      if (!filtered) wireRowDnD(row, tree);
    });
    if (selectedRowId) {
      const sel = $(`.tree-row[data-id="${CSS.escape(selectedRowId)}"]`, tree);
      if (sel) sel.classList.add('kb-focus');
    }
  }

  function selectRow(id) {
    selectedRowId = id;
    $$('.tree-row').forEach(r => r.classList.toggle('kb-focus', r.dataset.id === id));
  }

  function onRowKey(e, row, rows) {
    if (e.target.matches('input[type=text]')) return; // inline rename in progress
    const id = row.dataset.id;
    const node = findNode(id);
    const idx = rows.indexOf(row);
    const visible = rows.filter(r => !r.closest('.tree-children.collapsed'));
    const vIdx = visible.indexOf(row);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = visible[vIdx + 1]; if (next) { next.focus(); selectRow(next.dataset.id); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = visible[vIdx - 1]; if (prev) { prev.focus(); selectRow(prev.dataset.id); }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (node && node.type === 'folder' && collapsed.has(id)) toggleCollapse(id, row);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (node && node.type === 'folder' && !collapsed.has(id)) toggleCollapse(id, row);
    } else if (e.key === 'Enter') {
      e.preventDefault(); openWizard(id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); deleteNode(id);
    }
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    renderTree();
    const row = $(`.tree-row[data-id="${CSS.escape(id)}"]`);
    if (row) row.focus();
  }

  // ---- mutations ----
  function setEnabled(id, on) {
    const n = findNode(id);
    if (!n) return;
    n.enabled = on;
    saveTree().then(renderTree);
  }

  // Two independent favourite slots — one runs on a double-tap of the bud, the
  // other on a hold. Each row has its own toggle for each, so two different
  // actions can be favourited at once. One row can only hold one of the two.
  function favKindOf(id) {
    return cfg.favoriteId === id ? 'dbl' : cfg.holdFavoriteId === id ? 'hold' : '';
  }
  const FAV_SLOT = { dbl: 'favoriteId', hold: 'holdFavoriteId' };
  function toggleFavorite(id, slot) {
    const was = favKindOf(id);
    const next = was === slot
      ? { [FAV_SLOT[slot]]: null }                      // clicking the lit one clears it
      : { [FAV_SLOT[slot]]: id, ...(was ? { [FAV_SLOT[was]]: null } : {}) };
    const label = (findNode(id) || {}).label || 'This action';
    patch(next).then(() => {
      renderTree();
      toast(was === slot ? `“${label}” is no longer a favourite`
        : `“${label}” now runs when you ${slot === 'hold' ? 'hold' : 'double-tap'} the bud`,
        { kind: was === slot ? '' : 'ok' });
    });
  }

  function togglePin(id) {
    const pins = (cfg.pinnedIds || []).slice();
    const i = pins.indexOf(id);
    if (i >= 0) pins.splice(i, 1); else pins.push(id);
    patch({ pinnedIds: pins }).then(renderTree);
  }

  function reId(node) {
    node.id = slugId(node.label);
    (node.children || []).forEach(reId);
    return node;
  }

  function duplicateNode(id) {
    const parent = findParent(id);
    const n = findNode(id);
    if (!parent || !n) return;
    if (!capOk(parent)) return;
    if (!layerOk(n, parent)) return;
    const copy = reId(deepClone(n));
    copy.label = (copy.label || 'Copy') + ' copy';
    const idx = parent.children.indexOf(n);
    parent.children.splice(idx + 1, 0, copy);
    saveTree().then(renderTree);
  }

  function deleteNode(id) {
    const parent = findParent(id);
    const n = findNode(id);
    if (!parent || !n) return;
    const idx = parent.children.indexOf(n);
    parent.children.splice(idx, 1);
    // both favourite slots can point into the deleted subtree
    const held = k => cfg[k] === id || !!(cfg[k] && n.children && findNode(cfg[k], n));
    const clear = {};
    if (held('favoriteId')) clear.favoriteId = null;
    if (held('holdFavoriteId')) clear.holdFavoriteId = null;
    undoStash = { node: deepClone(n), parentId: parent.id, index: idx, favoriteId: cfg.favoriteId, holdFavoriteId: cfg.holdFavoriteId };
    const doSave = Object.keys(clear).length ? patch(clear).then(() => saveTree()) : saveTree();
    doSave.then(() => {
      renderTree();
      toast(`Deleted "${n.label || n.id}"`, {
        undo: () => {
          const stash = undoStash; undoStash = null;
          if (!stash) return;
          const p = findNode(stash.parentId) || cfg.root;
          p.children = p.children || [];
          p.children.splice(Math.min(stash.index, p.children.length), 0, stash.node);
          const back = {};
          if (stash.favoriteId && !cfg.favoriteId) back.favoriteId = stash.favoriteId;
          if (stash.holdFavoriteId && !cfg.holdFavoriteId) back.holdFavoriteId = stash.holdFavoriteId;
          const restore = Object.keys(back).length ? patch(back).then(() => saveTree()) : saveTree();
          restore.then(renderTree);
        }
      });
    });
  }

  function moveNode(id, dir) {
    const parent = findParent(id);
    const n = findNode(id);
    if (!parent || !n) return;
    const idx = parent.children.indexOf(n);
    const to = idx + dir;
    if (to < 0 || to >= parent.children.length) return;
    parent.children.splice(idx, 1);
    parent.children.splice(to, 0, n);
    saveTree().then(() => {
      renderTree();
      const row = $(`.tree-row[data-id="${CSS.escape(id)}"]`);
      if (row) { row.focus(); selectRow(id); }
    });
  }

  function isDescendant(maybeChildId, ancestorId) {
    const anc = findNode(ancestorId);
    return !!(anc && findNode(maybeChildId, anc));
  }

  // ---- drag & drop ----
  // Only the grip is the drag source; the row is the drop zone (Electron-reliable).
  function wireRowDnD(row, tree) {
    const id = row.dataset.id;
    const handle = $('.tr-handle', row);

    if (handle) {
      handle.addEventListener('dragstart', e => {
        dragState = { id };
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', id);
          e.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2);
        } catch (_) {}
      });
      handle.addEventListener('dragend', () => {
        $$('.tree-row.dragging').forEach(r => r.classList.remove('dragging'));
        clearDropUI();
        dragState = null;
      });
    }

    row.addEventListener('dragover', e => {
      if (!dragState || dragState.id === id) return;
      if (isDescendant(id, dragState.id)) return; // can't drop into own subtree
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const node = findNode(id);
      const isFolder = node && node.type === 'folder';
      clearDropUI();
      if (isFolder && y > rect.height * 0.25 && y < rect.height * 0.75) {
        dragState.overId = id; dragState.pos = 'into';
        row.classList.add('drop-into');
      } else {
        dragState.overId = id;
        dragState.pos = y < rect.height / 2 ? 'before' : 'after';
        showDropLine(row, tree, dragState.pos);
      }
    });
    row.addEventListener('dragleave', e => {
      // only clear when actually leaving the row (not entering a child element)
      if (e.relatedTarget && row.contains(e.relatedTarget)) return;
      if (dragState && dragState.overId === id) { clearDropUI(); dragState.overId = null; }
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragState || !dragState.overId) return;
      const { id: srcId, overId, pos } = dragState;
      clearDropUI();
      handleDrop(srcId, overId, pos, e);
      dragState = null;
    });
  }

  function showDropLine(row, tree, pos) {
    let line = $('#drop-line');
    if (!line) {
      line = document.createElement('div');
      line.id = 'drop-line';
      tree.appendChild(line);
    }
    const tr = tree.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    line.style.top = ((pos === 'before' ? rr.top : rr.bottom) - tr.top + tree.scrollTop - 1) + 'px';
  }

  function clearDropUI() {
    const line = $('#drop-line'); if (line) line.remove();
    $$('.tree-row.drop-into').forEach(r => r.classList.remove('drop-into'));
    const chip = $('.merge-chip'); if (chip) chip.remove();
  }

  function handleDrop(srcId, targetId, pos, e) {
    const src = findNode(srcId);
    const target = findNode(targetId);
    if (!src || !target || srcId === targetId) return;
    const srcParent = findParent(srcId);

    if (pos === 'into') {
      if (!capOk(target)) return;
      if (!layerOk(src, target)) return;
      srcParent.children.splice(srcParent.children.indexOf(src), 1);
      target.children = target.children || [];
      target.children.push(src);
      collapsed.delete(targetId);
      saveTree().then(renderTree);
      return;
    }

    // Leaf dropped on the middle band of another leaf → offer merge into a folder.
    if (target.type !== 'folder' && src.type !== 'folder' && e) {
      const row = $(`.tree-row[data-id="${CSS.escape(targetId)}"]`);
      const rect = row ? row.getBoundingClientRect() : null;
      if (rect) {
        const y = e.clientY - rect.top;
        if (y > rect.height * 0.3 && y < rect.height * 0.7) {
          offerMerge(src, target, row);
          return;
        }
      }
    }

    // reorder before/after target
    const tgtParent = findParent(targetId);
    if (!tgtParent) return;
    if (tgtParent.id !== srcParent.id && !capOk(tgtParent)) return;
    if (tgtParent.id !== srcParent.id && !layerOk(src, tgtParent)) return;
    srcParent.children.splice(srcParent.children.indexOf(src), 1);
    let idx = tgtParent.children.indexOf(target);
    if (pos === 'after') idx += 1;
    tgtParent.children.splice(idx, 0, src);
    saveTree().then(renderTree);
  }

  function offerMerge(src, target, row) {
    clearDropUI();
    const tree = $('#tree');
    const chip = document.createElement('div');
    chip.className = 'merge-chip';
    chip.innerHTML = `${icon('folder', 14)}<span>Merge into new folder?</span>
      <button class="btn btn-primary btn-sm" data-m="yes">Merge</button>
      <button class="btn btn-sm" data-m="no">Cancel</button>`;
    const tr = tree.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    chip.style.top = (rr.bottom - tr.top + tree.scrollTop + 4) + 'px';
    chip.style.left = Math.max(8, rr.left - tr.left + 24) + 'px';
    tree.appendChild(chip);
    $('[data-m=no]', chip).addEventListener('click', () => chip.remove());
    $('[data-m=yes]', chip).addEventListener('click', () => {
      chip.remove();
      const srcParent = findParent(src.id);
      const tgtParent = findParent(target.id);
      if (!srcParent || !tgtParent) return;
      if (!canAddFolderIn(tgtParent)) { toast('Bloom rings go 4 layers deep — can’t make a folder this deep.', { kind: 'bad' }); return; }
      srcParent.children.splice(srcParent.children.indexOf(src), 1);
      const folder = { id: slugId('group'), type: 'folder', label: 'New Group', icon: 'folder', enabled: true, children: [target, src] };
      const idx = tgtParent.children.indexOf(target);
      tgtParent.children.splice(idx, 1, folder);
      saveTree().then(() => { renderTree(); startInlineRename(folder.id); });
    });
    setTimeout(() => {
      const away = ev => { if (!chip.contains(ev.target)) { chip.remove(); document.removeEventListener('mousedown', away); } };
      document.addEventListener('mousedown', away);
    }, 0);
  }

  function startInlineRename(id) {
    const row = $(`.tree-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const labelEl = $('.tr-label', row);
    const node = findNode(id);
    if (!labelEl || !node) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'in';
    input.style.height = '26px';
    input.value = node.label || '';
    input.setAttribute('aria-label', 'Rename');
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    function commit(save) {
      if (done) return; done = true;
      if (save && input.value.trim()) node.label = input.value.trim();
      saveTree().then(renderTree);
    }
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      else if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  // ==== WIZARD ====
  const TYPE_DEFS = [
    { type: 'folder', name: 'Folder', icon: 'folder', desc: 'Opens a nested ring' },
    { type: 'launch_app', name: 'Launch App', icon: 'grid', desc: 'Start or focus an application' },
    { type: 'open_url', name: 'Open URL', icon: 'globe', desc: 'One or more sites, in any browser' },
    { type: 'terminal', name: 'Terminal', icon: 'terminal', desc: 'Open a shell profile, run a command' },
    { type: 'system_toggle', name: 'System Toggle', icon: 'monitor', desc: 'Lock, screenshot, dark mode…' },
    { type: 'media', name: 'Media', icon: 'music', desc: 'Play, pause, skip, volume' },
    { type: 'snippet', name: 'Snippet', icon: 'clipboard', desc: 'Copy or type saved text' },
    { type: 'open_path', name: 'Open Path', icon: 'folder-open', desc: 'Jump to a file or folder' },
    { type: 'script', name: 'Script', icon: 'code', desc: 'Run your own .sh / .py / .ps1' },
    { type: 'webhook', name: 'Webhook', icon: 'link', desc: 'Call a URL — GET or POST' },
    { type: 'macro', name: 'Macro', icon: 'zap', desc: 'A chain of steps, run in order' },
    { type: 'bloom', name: 'Bloom', icon: 'bloom', desc: 'Built-in Bloom action' }
  ];
  const SWATCHES = ['#5EEAD4', '#7DD3FC', '#A78BFA', '#F472B6', '#FB923C', '#FBBF24', '#34D399'];
  const TOGGLES = {
    screenshot: 'Screenshot', lock: 'Lock screen', dark_theme: 'Dark theme', night_light: 'Night light',
    mute: 'Mute', volume_up: 'Volume up', volume_down: 'Volume down', wifi_on: 'Wi-Fi on', wifi_off: 'Wi-Fi off',
    bt_on: 'Bluetooth on', bt_off: 'Bluetooth off', dnd_on: 'Do Not Disturb on', dnd_off: 'Do Not Disturb off',
    show_desktop: 'Show desktop', sleep: 'Sleep', restart: 'Restart', shutdown: 'Shut down'
  };
  const CONFIRM_TOGGLES = ['sleep', 'restart', 'shutdown'];
  const MEDIA_KEYS = { playpause: 'Play / Pause', next: 'Next track', prev: 'Previous track', volup: 'Volume up', voldown: 'Volume down', mute: 'Mute' };
  const BROWSERS = ['default', 'chrome', 'firefox', 'edge', 'brave', 'chromium'];
  const TERMINALS = ['default', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'alacritty', 'kitty', 'xterm', 'wt', 'powershell', 'cmd'];

  function openWizard(nodeId, targetFolderId) {
    const editing = !!nodeId;
    const original = editing ? findNode(nodeId) : null;
    if (editing && !original) return;
    const draft = editing
      ? deepClone(original)
      : { id: '', type: null, label: '', icon: 'sparkle', color: null, enabled: true, params: {} };
    let step = editing ? 2 : 1;
    let labelTouched = editing;
    let iconTouched = editing;
    // where a new node will land — used to forbid folders past the 4-layer cap
    const addTarget = editing ? null : (findNode(targetFolderId || 'root') || cfg.root);
    const folderAllowed = editing ? true : canAddFolderIn(addTarget);

    const { modal, close } = openModal(`
      <div class="modal-head"><h2 id="wz-title"></h2><div class="sub" id="wz-sub"></div></div>
      <div class="modal-body" id="wz-body"></div>
      <div class="modal-foot">
        <button class="btn" id="wz-run" hidden>Run now ▷</button>
        <span class="run-result" id="wz-result"></span>
        <span class="spring"></span>
        <button class="btn" id="wz-cancel">Cancel</button>
        <button class="btn" id="wz-back" hidden>Back</button>
        <button class="btn btn-primary" id="wz-next">Next</button>
      </div>`);

    const body = $('#wz-body', modal);
    const btnNext = $('#wz-next', modal), btnBack = $('#wz-back', modal);
    const btnRun = $('#wz-run', modal), result = $('#wz-result', modal);
    $('#wz-cancel', modal).addEventListener('click', close);

    function setResult(html, cls) { result.className = 'run-result ' + (cls || ''); result.innerHTML = html; }

    btnRun.addEventListener('click', async () => {
      if (!collectStep2(body, draft, true)) return;
      setResult('Running…', '');
      try {
        const r = await bloom.execute(deepClone(draft));
        if (r && r.ok) setResult(`${icon('check', 13)} Ran fine`, 'ok');
        else setResult(`${icon('x', 13)} failed: ${esc((r && r.error) || 'unknown')}`, 'bad');
      } catch (err) { setResult(`${icon('x', 13)} failed: ${esc(err.message || String(err))}`, 'bad'); }
    });

    btnBack.addEventListener('click', () => {
      if (step <= (editing ? 2 : 1)) return;
      step--;
      if (step === 2 && draft.type === 'folder') step = 1; // folders have no param step
      render();
    });
    btnNext.addEventListener('click', async () => {
      if (step === 1) { if (draft.type) { step = draft.type === 'folder' ? 3 : 2; render(); } return; }
      if (step === 2) { if (collectStep2(body, draft)) { step = 3; render(); } return; }
      // step 3: save
      if (!collectStep3(body, draft)) return;
      await saveDraft();
    });

    async function saveDraft() {
      if (editing) {
        Object.assign(original, {
          label: draft.label, icon: draft.icon, enabled: draft.enabled, params: draft.params
        });
        if (draft.color) original.color = draft.color; else delete original.color;
      } else {
        draft.id = slugId(draft.label);
        if (!draft.color) delete draft.color;
        if (draft.type === 'folder') draft.children = draft.children || [];
        const target = findNode(targetFolderId || 'root') || cfg.root;
        if (!capOk(target)) return;
        if (draft.type === 'folder' && !layerOk(draft, target)) return;
        target.children = target.children || [];
        target.children.push(draft);
        collapsed.delete(target.id);
      }
      await saveTree();
      close();
      renderTree();
      toast(editing ? `Saved "${draft.label}"` : `Added "${draft.label}"`, { kind: 'ok' });
    }

    function render() {
      setResult('', '');
      btnRun.hidden = !(step >= 2 && draft.type && draft.type !== 'folder');
      btnBack.hidden = step <= (editing ? 2 : 1) || (editing && step === 2) || (!editing && step === 1);
      if (editing && step === 3 && draft.type === 'folder') btnBack.hidden = true;
      $('#wz-title', modal).textContent = editing ? `Edit "${original.label || original.id}"` : 'Add action';
      const def = TYPE_DEFS.find(t => t.type === draft.type);
      $('#wz-sub', modal).textContent =
        step === 1 ? 'Pick what this node does'
        : step === 2 ? `${def ? def.name : ''} — parameters`
        : 'Label, icon & look';
      btnNext.textContent = step === 3 ? 'Save' : 'Next';
      body.scrollTop = 0;                 // steps share one scroll container — don't inherit the last step's offset
      if (step === 1) renderStep1();
      else if (step === 2) {
        if (draft.type === 'folder') { step = 3; render(); return; }
        renderStep2();
      }
      else renderStep3();
    }

    // ---- step 1: type grid ----
    function renderStep1() {
      body.innerHTML = `<div class="type-grid">` + TYPE_DEFS.map(t => {
        const blocked = t.type === 'folder' && !folderAllowed;
        return `<button class="type-card ${draft.type === t.type ? 'sel' : ''}" data-type="${t.type}" ${blocked ? 'disabled title="Rings go 4 layers deep — this spot can’t hold a folder"' : ''}>
          ${icon(t.icon, 20)}
          <span><span class="tc-name">${esc(t.name)}</span><div class="tc-desc">${blocked ? 'Already at the deepest layer' : esc(t.desc)}</div></span>
        </button>`;
      }).join('') + `</div>`;
      $$('.type-card', body).forEach(b => b.addEventListener('click', () => {
        if (b.disabled) return;
        draft.type = b.dataset.type;
        draft.params = defaultParams(draft.type);
        step = draft.type === 'folder' ? 3 : 2;
        render();
      }));
      $('.type-card.sel', body)?.scrollIntoView({ block: 'center' });
    }

    function defaultParams(type) {
      switch (type) {
        case 'launch_app': return { command: '', focusIfRunning: true };
        case 'open_url': return { urls: [], browser: 'default', profile: '', newWindow: false };
        case 'terminal': return { cwd: '', command: '', terminal: 'default', admin: false };
        case 'system_toggle': return { toggle: 'screenshot' };
        case 'media': return { key: 'playpause' };
        case 'snippet': return { text: '', mode: 'copy' };
        case 'open_path': return { path: '' };
        case 'script': return { file: '', args: '' };
        case 'webhook': return { url: '', method: 'GET', body: '' };
        case 'macro': return { steps: [] };
        case 'bloom': return { cmd: 'settings' };
        default: return {};
      }
    }

    // ---- step 2: params ----
    function renderStep2() {
      const p = draft.params || {};
      const t = draft.type;
      let html = '<div class="form-grid">';
      if (t === 'launch_app') {
        html += `
          <div class="f-field"><label for="wp-command">Command</label>
            <div class="f-inline">
              <input id="wp-command" class="in mono" data-p="command" value="${esc(p.command || '')}" placeholder="${bloom.getPlatform() === 'win32' ? 'notepad.exe' : 'firefox'}">
              <button class="btn" id="wp-browse">Browse installed apps…</button>
            </div>
            <span class="hint-err" data-err="command" hidden>Command is required</span></div>
          <label class="f-inline"><span class="tgl"><input type="checkbox" data-p="focusIfRunning" ${p.focusIfRunning ? 'checked' : ''}><span class="knob"></span></span>
            <span>Focus if already running (best effort)</span></label>`;
      } else if (t === 'open_url') {
        html += `
          <div class="f-field"><label for="wp-urls">URLs — one per line</label>
            <textarea id="wp-urls" class="in mono" data-p="urls" placeholder="https://example.com">${esc((p.urls || []).join('\n'))}</textarea>
            <span class="hint-err" data-err="urls" hidden>Every line must start with http:// or https://</span></div>
          <div class="f-field"><label for="wp-browser">Browser</label>
            <select id="wp-browser" class="sel" data-p="browser">${BROWSERS.map(b => `<option value="${b}" ${p.browser === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
          <div class="f-field" id="wp-profile-wrap"><label for="wp-profile">Profile</label>
            <input id="wp-profile" class="in" data-p="profile" value="${esc(p.profile || '')}" placeholder="Profile 1"></div>
          <label class="f-inline"><span class="tgl"><input type="checkbox" data-p="newWindow" ${p.newWindow ? 'checked' : ''}><span class="knob"></span></span>
            <span>Open in a new window</span></label>`;
      } else if (t === 'terminal') {
        html += `
          <div class="f-field"><label for="wp-cwd">Working directory</label>
            <input id="wp-cwd" class="in mono" data-p="cwd" value="${esc(p.cwd || '')}" placeholder="~/projects/app"></div>
          <div class="f-field"><label for="wp-cmd">Command <span class="hint">(runs after opening)</span></label>
            <input id="wp-cmd" class="in mono" data-p="command" value="${esc(p.command || '')}" placeholder="npm run dev"></div>
          <div class="f-field"><label for="wp-term">Terminal</label>
            <select id="wp-term" class="sel" data-p="terminal">${TERMINALS.map(x => `<option value="${x}" ${p.terminal === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <label class="f-inline"><span class="tgl"><input type="checkbox" data-p="admin" ${p.admin ? 'checked' : ''}><span class="knob"></span></span>
            <span>Elevated (asks every time)</span></label>
          <div class="note warn" data-admin-note ${p.admin ? '' : 'hidden'}>Elevated commands always show a confirmation dialog before running.</div>`;
      } else if (t === 'system_toggle') {
        html += `
          <div class="f-field"><label for="wp-toggle">Toggle</label>
            <select id="wp-toggle" class="sel" data-p="toggle">${Object.entries(TOGGLES).map(([v, l]) => `<option value="${v}" ${p.toggle === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="note warn" data-confirm-note ${CONFIRM_TOGGLES.includes(p.toggle) ? '' : 'hidden'}>Always asks for confirmation.</div>`;
      } else if (t === 'media') {
        html += `
          <div class="f-field"><label for="wp-key">Media key</label>
            <select id="wp-key" class="sel" data-p="key">${Object.entries(MEDIA_KEYS).map(([v, l]) => `<option value="${v}" ${p.key === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
      } else if (t === 'snippet') {
        html += `
          <div class="f-field"><label for="wp-text">Text</label>
            <textarea id="wp-text" class="in" data-p="text" placeholder="Your snippet…">${esc(p.text || '')}</textarea></div>
          <div class="f-field"><label>Mode</label>
            <label class="f-inline"><input type="radio" name="wp-mode" value="copy" ${p.mode !== 'paste' ? 'checked' : ''}> Copy to clipboard</label>
            <label class="f-inline"><input type="radio" name="wp-mode" value="paste" ${p.mode === 'paste' ? 'checked' : ''}> Type at cursor (best effort)</label></div>`;
      } else if (t === 'open_path') {
        html += `
          <div class="f-field"><label for="wp-path">Path</label>
            <input id="wp-path" class="in mono" data-p="path" value="${esc(p.path || '')}" placeholder="~/Documents">
            <span class="hint-err" data-err="path" hidden>Path is required</span></div>`;
      } else if (t === 'script') {
        html += `
          <div class="f-field"><label for="wp-file">Script file</label>
            <input id="wp-file" class="in mono" data-p="file" value="${esc(p.file || '')}" placeholder="~/bin/deploy.sh">
            <span class="hint-err" data-err="file" hidden>Script path is required</span></div>
          <div class="f-field"><label for="wp-args">Arguments</label>
            <input id="wp-args" class="in mono" data-p="args" value="${esc(p.args || '')}" placeholder="--fast"></div>
          <div class="note">Runs with your permissions. Bloom never elevates.</div>`;
      } else if (t === 'webhook') {
        html += `
          <div class="f-field"><label for="wp-url">URL</label>
            <input id="wp-url" class="in mono" data-p="url" value="${esc(p.url || '')}" placeholder="https://hooks.example.com/fire">
            <span class="hint-err" data-err="url" hidden>Must start with http:// or https://</span></div>
          <div class="f-field"><label for="wp-method">Method</label>
            <select id="wp-method" class="sel" data-p="method">
              <option value="GET" ${p.method !== 'POST' ? 'selected' : ''}>GET</option>
              <option value="POST" ${p.method === 'POST' ? 'selected' : ''}>POST</option></select></div>
          <div class="f-field" id="wp-body-wrap" ${p.method === 'POST' ? '' : 'hidden'}><label for="wp-hbody">Body</label>
            <textarea id="wp-hbody" class="in mono" data-p="body" placeholder='{"on": true}'>${esc(p.body || '')}</textarea></div>
          <div class="f-field"><label>Will call exactly</label>
            <div class="url-preview mono" id="wp-preview">${esc(p.url || '—')}</div></div>`;
      } else if (t === 'macro') {
        html += `<div id="macro-steps"></div>
          <button class="btn" id="macro-add">${icon('plus', 13)} Add step</button>
          <div class="note">Steps run in order, top to bottom.</div>`;
      } else if (t === 'bloom') {
        html += `
          <div class="f-field"><label for="wp-cmd2">Command</label>
            <select id="wp-cmd2" class="sel" data-p="cmd">
              <option value="settings" ${p.cmd !== 'palette' ? 'selected' : ''}>Open this settings window</option>
              <option value="palette" ${p.cmd === 'palette' ? 'selected' : ''}>Open the command palette</option></select></div>`;
      }
      html += '</div>';
      body.innerHTML = html;
      wireStep2(t, p);
    }

    function wireStep2(t, p) {
      if (t === 'launch_app') {
        $('#wp-browse', body).addEventListener('click', () => openAppBrowser(picked => {
          $('#wp-command', body).value = picked.command;
          if (!labelTouched) draft.label = picked.name;
          if (!iconTouched) draft.icon = 'letter:' + (picked.name[0] || 'A');
        }));
      }
      if (t === 'open_url') {
        const bsel = $('#wp-browser', body);
        const showProfile = () => { $('#wp-profile-wrap', body).hidden = !['chrome', 'firefox'].includes(bsel.value); };
        bsel.addEventListener('change', showProfile);
        $('#wp-profile', body).placeholder = bsel.value === 'firefox' ? 'dev-edition' : 'Profile 1';
        bsel.addEventListener('change', () => { $('#wp-profile', body).placeholder = bsel.value === 'firefox' ? 'dev-edition' : 'Profile 1'; });
        showProfile();
      }
      if (t === 'terminal') {
        $('[data-p=admin]', body).addEventListener('change', e => { $('[data-admin-note]', body).hidden = !e.target.checked; });
      }
      if (t === 'system_toggle') {
        $('#wp-toggle', body).addEventListener('change', e => {
          $('[data-confirm-note]', body).hidden = !CONFIRM_TOGGLES.includes(e.target.value);
        });
      }
      if (t === 'webhook') {
        const url = $('#wp-url', body);
        url.addEventListener('input', () => { $('#wp-preview', body).textContent = url.value || '—'; });
        $('#wp-method', body).addEventListener('change', e => { $('#wp-body-wrap', body).hidden = e.target.value !== 'POST'; });
      }
      if (t === 'macro') renderMacroEditor(p);
    }

    // ---- macro step editor ----
    function renderMacroEditor(p) {
      const wrap = $('#macro-steps', body);
      const steps = p.steps = p.steps || [];
      const STEP_TYPES = { launch_app: 'Launch app', open_url: 'Open URL', terminal: 'Terminal', system_toggle: 'Toggle', snippet: 'Snippet', wait: 'Wait' };
      function fieldsFor(s, i) {
        switch (s.action) {
          case 'wait': return `<input type="number" class="in" data-ms value="${Number(s.ms) || 1000}" min="0" step="100" aria-label="Milliseconds"> <span class="hint">ms</span>`;
          case 'open_url': return `<textarea class="in mono" data-urls placeholder="https://… one per line">${esc((s.urls || []).join('\n'))}</textarea>`;
          case 'launch_app': return `<input class="in mono" data-cmd value="${esc(s.command || '')}" placeholder="firefox" aria-label="Command">`;
          case 'terminal': return `<input class="in mono" data-cwd value="${esc(s.cwd || '')}" placeholder="~/projects" aria-label="Directory"><input class="in mono" data-cmd value="${esc(s.command || '')}" placeholder="command" aria-label="Command">`;
          case 'system_toggle': return `<select class="sel" data-tg>${Object.entries(TOGGLES).map(([v, l]) => `<option value="${v}" ${s.toggle === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
          case 'snippet': return `<input class="in" data-txt value="${esc(s.text || '')}" placeholder="text" aria-label="Snippet text"><select class="sel" data-md><option value="copy" ${s.mode !== 'paste' ? 'selected' : ''}>Copy</option><option value="paste" ${s.mode === 'paste' ? 'selected' : ''}>Paste</option></select>`;
          default: return '';
        }
      }
      function draw() {
        wrap.innerHTML = steps.map((s, i) => `
          <div class="macro-step" data-i="${i}">
            <select class="sel" data-st aria-label="Step type">${Object.entries(STEP_TYPES).map(([v, l]) => `<option value="${v}" ${s.action === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <div class="ms-fields">${fieldsFor(s, i)}</div>
            <div class="ms-btns">
              <button class="icon-btn" data-mup title="Move up">${icon('chevron-up', 13)}</button>
              <button class="icon-btn" data-mdn title="Move down">${icon('chevron-down', 13)}</button>
              <button class="icon-btn danger" data-mrm title="Remove">${icon('x', 13)}</button>
            </div>
          </div>`).join('') || `<div class="empty-state" style="padding:18px">${icon('zap', 22)}<p>No steps yet.</p></div>`;
        $$('.macro-step', wrap).forEach(row => {
          const i = +row.dataset.i;
          $('[data-st]', row).addEventListener('change', e => { steps[i] = freshStep(e.target.value); draw(); });
          const sync = () => syncStep(row, steps[i]);
          $$('input, textarea, select', row).forEach(el => { if (!el.matches('[data-st]')) el.addEventListener('input', sync); });
          $('[data-mup]', row).addEventListener('click', () => { if (i > 0) { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); draw(); } });
          $('[data-mdn]', row).addEventListener('click', () => { if (i < steps.length - 1) { steps.splice(i + 1, 0, steps.splice(i, 1)[0]); draw(); } });
          $('[data-mrm]', row).addEventListener('click', () => { steps.splice(i, 1); draw(); });
        });
      }
      function freshStep(action) {
        switch (action) {
          case 'wait': return { action, ms: 1000 };
          case 'open_url': return { action, urls: [], browser: 'default' };
          case 'launch_app': return { action, command: '' };
          case 'terminal': return { action, cwd: '', command: '' };
          case 'system_toggle': return { action, toggle: 'screenshot' };
          case 'snippet': return { action, text: '', mode: 'copy' };
        }
      }
      function syncStep(row, s) {
        const g = sel => { const el = $(sel, row); return el ? el.value : undefined; };
        if (s.action === 'wait') s.ms = Math.max(0, Number(g('[data-ms]')) || 0);
        else if (s.action === 'open_url') s.urls = String(g('[data-urls]') || '').split('\n').map(x => x.trim()).filter(Boolean);
        else if (s.action === 'launch_app') s.command = g('[data-cmd]') || '';
        else if (s.action === 'terminal') { s.cwd = g('[data-cwd]') || ''; s.command = g('[data-cmd]') || ''; }
        else if (s.action === 'system_toggle') s.toggle = g('[data-tg]');
        else if (s.action === 'snippet') { s.text = g('[data-txt]') || ''; s.mode = g('[data-md]') || 'copy'; }
      }
      $('#macro-add', body).addEventListener('click', () => { steps.push(freshStep('launch_app')); draw(); });
      draw();
    }

    // read + validate step-2 form into draft.params
    function collectStep2(root, draft, silentIfStep3) {
      if (step === 3 && silentIfStep3) return true; // running from identity step: params already collected
      if (draft.type === 'folder' || step !== 2) return true;
      const t = draft.type;
      const p = draft.params = draft.params || {};
      const val = sel => { const el = $(sel, root); return el ? el.value : undefined; };
      const chk = sel => { const el = $(sel, root); return !!(el && el.checked); };
      const fail = (key, sel) => {
        const err = $(`[data-err="${key}"]`, root); if (err) err.hidden = false;
        const el = $(sel, root); if (el) { el.classList.add('err'); el.focus(); }
        return false;
      };
      $$('.hint-err', root).forEach(e => { e.hidden = true; });
      $$('.in.err', root).forEach(e => e.classList.remove('err'));

      if (t === 'launch_app') {
        p.command = (val('[data-p=command]') || '').trim();
        p.focusIfRunning = chk('[data-p=focusIfRunning]');
        if (!p.command) return fail('command', '[data-p=command]');
      } else if (t === 'open_url') {
        const lines = String(val('[data-p=urls]') || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length || lines.some(u => !/^https?:\/\//i.test(u))) return fail('urls', '[data-p=urls]');
        p.urls = lines;
        p.browser = val('[data-p=browser]') || 'default';
        p.profile = ['chrome', 'firefox'].includes(p.browser) ? (val('[data-p=profile]') || '').trim() : '';
        p.newWindow = chk('[data-p=newWindow]');
      } else if (t === 'terminal') {
        p.cwd = (val('[data-p=cwd]') || '').trim();
        p.command = (val('[data-p=command]') || '').trim();
        p.terminal = val('[data-p=terminal]') || 'default';
        p.admin = chk('[data-p=admin]');
      } else if (t === 'system_toggle') {
        p.toggle = val('[data-p=toggle]');
        if (CONFIRM_TOGGLES.includes(p.toggle)) p.confirm = true; else delete p.confirm;
      } else if (t === 'media') {
        p.key = val('[data-p=key]');
      } else if (t === 'snippet') {
        p.text = val('[data-p=text]') || '';
        const m = root.querySelector('input[name=wp-mode]:checked');
        p.mode = m ? m.value : 'copy';
      } else if (t === 'open_path') {
        p.path = (val('[data-p=path]') || '').trim();
        if (!p.path) return fail('path', '[data-p=path]');
      } else if (t === 'script') {
        p.file = (val('[data-p=file]') || '').trim();
        p.args = (val('[data-p=args]') || '').trim();
        if (!p.file) return fail('file', '[data-p=file]');
      } else if (t === 'webhook') {
        p.url = (val('[data-p=url]') || '').trim();
        p.method = val('[data-p=method]') || 'GET';
        p.body = p.method === 'POST' ? (val('[data-p=body]') || '') : '';
        if (!/^https?:\/\//i.test(p.url)) return fail('url', '[data-p=url]');
      } else if (t === 'bloom') {
        p.cmd = val('[data-p=cmd]') || 'settings';
      }
      // macro: steps array is synced live by the editor
      return true;
    }

    // ---- step 3: identity ----
    function renderStep3() {
      body.innerHTML = `
        <div class="form-grid">
          <div class="f-field"><label for="wz-label">Label</label>
            <input id="wz-label" class="in" value="${esc(draft.label || '')}" placeholder="My action" maxlength="48">
            <span class="hint-err" id="wz-label-err" hidden>Give it a name</span></div>
          <div class="f-field"><label>Icon</label><div id="wz-iconpicker"></div></div>
          <div class="f-field"><label>Accent color <span class="hint">(optional override)</span></label>
            <div class="swatches" id="wz-swatches">
              ${SWATCHES.map(c => `<button class="swatch-dot ${draft.color === c ? 'sel' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
              <input type="color" class="swatch" id="wz-custom-color" value="${esc(draft.color || '#5EEAD4')}" aria-label="Custom color">
              <button class="swatch-none ${!draft.color ? 'sel' : ''}" id="wz-color-none" aria-label="No color"></button>
            </div></div>
          <label class="f-inline"><span class="tgl"><input type="checkbox" id="wz-enabled" ${draft.enabled !== false ? 'checked' : ''}><span class="knob"></span></span>
            <span>Enabled</span></label>
        </div>`;
      $('#wz-label', body).addEventListener('input', () => { labelTouched = true; });
      renderIconPicker($('#wz-iconpicker', body), draft.icon, ic => { draft.icon = ic; iconTouched = true; });
      const sw = $('#wz-swatches', body);
      function selColor(c) {
        draft.color = c;
        $$('.swatch-dot, .swatch-none', sw).forEach(b => b.classList.remove('sel'));
        if (c === null) $('#wz-color-none', sw).classList.add('sel');
        else { const hit = $(`.swatch-dot[data-c="${c}"]`, sw); if (hit) hit.classList.add('sel'); }
      }
      $$('.swatch-dot', sw).forEach(b => b.addEventListener('click', () => selColor(b.dataset.c)));
      $('#wz-custom-color', sw).addEventListener('input', e => selColor(e.target.value));
      $('#wz-color-none', sw).addEventListener('click', () => selColor(null));
    }

    function collectStep3(root, draft) {
      const label = $('#wz-label', root).value.trim();
      if (!label) { $('#wz-label-err', root).hidden = false; $('#wz-label', root).classList.add('err'); $('#wz-label', root).focus(); return false; }
      draft.label = label;
      draft.enabled = $('#wz-enabled', root).checked;
      return true;
    }

    render();
  }

  // ---- icon picker ----
  const EMOJI_GROUPS = [
    ['Frequent', ['🔥', '🚀', '⭐', '✨', '⚡', '🌸', '💡', '🎯', '✅', '❤️', '🔖', '📌']],
    ['Work', ['💻', '🖥️', '⌨️', '🖱️', '📁', '📂', '📄', '📊', '📈', '📝', '📋', '🗂️', '🗓️', '⏰', '📎', '🔗', '💼', '🏢', '✉️', '📮']],
    ['Dev', ['🐛', '🔧', '🔨', '⚙️', '🧪', '🧰', '🗄️', '🔑', '🔒', '🛡️', '🧩', '📦', '🌐', '☁️', '🔌', '⌛', '🧵', '🪟']],
    ['Media', ['🎧', '🎵', '🎬', '📷', '📹', '🎙️', '🎨', '🖌️', '🎮', '🕹️', '📺', '🔊', '🔇', '📻']],
    ['Life', ['☕', '🍵', '🍕', '🍔', '🌙', '☀️', '🌈', '🌊', '🌲', '🐱', '🐶', '🦊', '🌻', '🎉', '🎁', '🏆', '💰', '🛒', '🏃', '🧘']],
    ['Signals', ['🟢', '🟡', '🔴', '🔵', '🟣', '🟠', '⬛', '⬜', '❗', '❓', '⚠️', '🚫', '🔔', '👀', '👍', '🧠', '💬', '🗑️']]
  ];
  // extra search words for icons whose name isn't what you'd type
  const ICON_ALIAS = {
    zap: 'lightning bolt fast', sparkle: 'magic ai stars', bloom: 'logo brand',
    grid: 'apps launcher', globe: 'web internet browser site', terminal: 'shell console cmd',
    gear: 'settings preferences options', zzz: 'sleep suspend', power: 'shutdown quit off',
    'volume-x': 'mute silence', cpu: 'processor chip system', monitor: 'display screen desktop',
    drag: 'move handle reorder', question: 'help faq', activity: 'monitor pulse graph',
    clipboard: 'copy paste notes', file: 'document', pencil: 'edit rename write',
    trash: 'delete remove bin', link: 'url chain webhook', code: 'dev programming script',
    briefcase: 'work job office', flame: 'fire hot streak', pin: 'location map place',
    cart: 'shop shopping buy', text: 'font type typography', wrench: 'tool fix repair',
    'trending-up': 'growth chart stats', 'bar-chart': 'stats graph analytics',
    'pie-chart': 'stats graph analytics', hold: 'press long-press favourite'
  };

  function renderIconPicker(container, current, onPick) {
    let mode = current && current.startsWith('emoji:') ? 'emoji' : (current && (current.startsWith('url:') || /^https?:/.test(current)) ? 'url' : 'icons');
    let value = current || 'sparkle';
    function draw() {
      container.innerHTML = `
        <div class="f-inline" style="margin-bottom:8px">
          <span class="ip-preview" id="ip-preview">${icon(value, 20)}</span>
          <div class="ip-tabs" role="tablist">
            <button data-m="icons" class="${mode === 'icons' ? 'on' : ''}" role="tab">Icons</button>
            <button data-m="emoji" class="${mode === 'emoji' ? 'on' : ''}" role="tab">Emoji</button>
            <button data-m="url" class="${mode === 'url' ? 'on' : ''}" role="tab">Image URL</button>
          </div>
        </div>
        <div id="ip-body"></div>`;
      $$('.ip-tabs button', container).forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; draw(); }));
      const ipb = $('#ip-body', container);
      if (mode === 'icons') {
        ipb.innerHTML = `<input class="in" id="ip-search" placeholder="Search icons…" style="width:100%;margin-bottom:7px" aria-label="Search icons">
          <div class="icon-grid" id="ip-grid"></div>`;
        const grid = $('#ip-grid', ipb);
        const drawGrid = q => {
          const names = BloomIcons.names.filter(n => !q || n.includes(q) || (ICON_ALIAS[n] || '').includes(q));
          grid.innerHTML = names.length
            ? names.map(n => `<button class="icon-cell ${value === n ? 'sel' : ''}" data-n="${n}" title="${n}" aria-label="${n}">${icon(n, 24)}</button>`).join('')
            : `<div class="ip-hint" style="grid-column:1/-1;padding:14px;text-align:center">No icon matches “${esc(q)}” — try the Emoji tab.</div>`;
          $$('.icon-cell', grid).forEach(c => c.addEventListener('click', () => { set(c.dataset.n); drawGrid(q); }));
        };
        $('#ip-search', ipb).addEventListener('input', e => drawGrid(e.target.value.trim().toLowerCase()));
        drawGrid('');
      } else if (mode === 'emoji') {
        const cur = value.startsWith('emoji:') ? value.slice(6) : '';
        ipb.innerHTML = `<input class="in" id="ip-emoji" placeholder="…or paste any emoji" style="width:100%" maxlength="8" aria-label="Emoji">
          <div id="ip-emoji-body"></div>`;
        const eb = $('#ip-emoji-body', ipb);
        eb.innerHTML = EMOJI_GROUPS.map(([name, list]) =>
          `<div class="ip-cat">${esc(name)}</div>
           <div class="emoji-suggest">${list.map(e =>
            `<button data-e="${esc(e)}" class="${e === cur ? 'sel' : ''}" title="${esc(e)}">${e}</button>`).join('')}</div>`).join('');
        $('#ip-emoji', ipb).addEventListener('input', e => {
          const g = firstGrapheme(e.target.value);
          if (g) { set('emoji:' + g); markEmoji(eb, g); }
        });
        $$('.emoji-suggest button', eb).forEach(b => b.addEventListener('click', () => { set('emoji:' + b.dataset.e); markEmoji(eb, b.dataset.e); }));
      } else {
        const url = value.startsWith('url:') ? value.slice(4) : (/^https?:/.test(value) ? value : '');
        ipb.innerHTML = `<input class="in mono" id="ip-url" value="${esc(url)}" placeholder="https://example.com/favicon.ico" style="width:100%" aria-label="Image URL">
          <div class="ip-hint" id="ip-url-msg">Any PNG, SVG, JPG or favicon URL. It is fetched live, so it needs a connection.</div>`;
        const msg = $('#ip-url-msg', ipb);
        const probe = u => {
          msg.className = 'ip-hint';
          msg.textContent = 'Loading…';
          const img = new Image();
          img.onload = () => { msg.className = 'ip-hint ok'; msg.textContent = `Loaded — ${img.naturalWidth}×${img.naturalHeight}`; };
          img.onerror = () => { msg.className = 'ip-hint bad'; msg.textContent = 'Could not load that image — check the URL.'; };
          img.src = u;
        };
        if (url) probe(url);
        $('#ip-url', ipb).addEventListener('input', debounce(e => {
          const u = e.target.value.trim();
          if (!u) { msg.className = 'ip-hint'; msg.textContent = 'Paste an image URL.'; return; }
          if (!/^https?:\/\//.test(u)) { msg.className = 'ip-hint bad'; msg.textContent = 'Must start with http:// or https://'; return; }
          set('url:' + u);
          probe(u);
        }, 300));
      }
    }
    function set(v) { value = v; onPick(v); const pv = $('#ip-preview', container); if (pv) pv.innerHTML = icon(v, 20); }
    function markEmoji(root, ch) {
      $$('.emoji-suggest button', root).forEach(b => b.classList.toggle('sel', b.dataset.e === ch));
    }
    function firstGrapheme(s) {
      s = s.trim();
      if (!s) return '';
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next();
        return it.done ? '' : it.value.segment;
      }
      return Array.from(s)[0] || '';
    }
    draw();
  }

  // ---- app browser sub-modal ----
  function openAppBrowser(onPick) {
    const { modal, close } = openModal(`
      <div class="modal-head"><h2>Installed apps</h2></div>
      <div class="modal-body">
        <input class="in" id="ab-search" placeholder="Search apps…" style="width:100%" aria-label="Search apps">
        <div class="app-list" id="ab-list"><div class="gs-empty">Loading…</div></div>
      </div>
      <div class="modal-foot"><span class="spring"></span><button class="btn" id="ab-cancel">Cancel</button></div>`);
    $('#ab-cancel', modal).addEventListener('click', close);
    let apps = [];
    const list = $('#ab-list', modal);
    function draw(q) {
      const hits = apps.filter(a => !q || a.name.toLowerCase().includes(q) || (a.command || '').toLowerCase().includes(q));
      list.innerHTML = hits.length
        ? hits.slice(0, 200).map((a, i) => `<button class="app-item" data-i="${apps.indexOf(a)}"><span class="an">${esc(a.name)}</span><span class="ac mono">${esc(a.command || '')}</span></button>`).join('')
        : `<div class="gs-empty">No apps found</div>`;
      $$('.app-item', list).forEach(b => b.addEventListener('click', () => { const a = apps[+b.dataset.i]; close(); onPick(a); }));
    }
    bloom.listApps().then(r => { apps = Array.isArray(r) ? r : []; draw(''); })
      .catch(() => { list.innerHTML = `<div class="gs-empty">Could not list apps</div>`; });
    $('#ab-search', modal).addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
  }

  // ==== APPEARANCE TAB ====
  const SLIDER_GROUPS = [
    {
      title: 'The dial', sliders: [
        { sid: 'nodeSize', label: 'Wedge thickness', sub: 'How chunky each segment of the ring is', min: 38, max: 60, step: 1, get: () => cfg.appearance.nodeSize, set: v => ({ appearance: { nodeSize: v } }), fmt: v => v + 'px' },
        { sid: 'ringRadius', label: 'Dial radius', sub: 'How far the ring sits from the bud', min: 96, max: 180, step: 1, get: () => cfg.appearance.ringRadius, set: v => ({ appearance: { ringRadius: v } }), fmt: v => v + 'px' },
        { sid: 'ringGap', label: 'Layer gap', sub: 'Space between a ring and the deeper ring it opens', min: 40, max: 140, step: 1, get: () => cfg.appearance.ringGap, set: v => ({ appearance: { ringGap: v } }), fmt: v => v + 'px' },
        { sid: 'dim', label: 'Backdrop dim', sub: 'How much the desktop darkens while the dial is open', min: 0, max: 1, step: 0.05, get: () => cfg.appearance.dim ?? 0.35, set: v => ({ appearance: { dim: v } }), fmt: v => Math.round(v * 100) + '%' },
        { sid: 'motionScale', label: 'Motion speed', sub: 'How fast it opens — 1× is normal, higher is snappier', min: 0.5, max: 2, step: 0.05, get: () => cfg.appearance.motionScale, set: v => ({ appearance: { motionScale: v } }), fmt: v => v.toFixed(2) + '×' }
      ]
    },
    {
      title: 'The bud', sliders: [
        { sid: 'budSize', label: 'Bud size', sub: 'Diameter of the resting bud', min: 32, max: 64, step: 1, get: () => cfg.bud.size, set: v => ({ bud: { size: v } }), fmt: v => v + 'px' },
        { sid: 'budOpacity', label: 'Bud idle opacity', sub: 'How faded the bud looks when you’re not using it', min: 0.2, max: 1, step: 0.01, get: () => cfg.bud.idleOpacity, set: v => ({ bud: { idleOpacity: v } }), fmt: v => Math.round(v * 100) + '%' }
      ]
    }
  ];
  const ALL_SLIDERS = SLIDER_GROUPS.flatMap(g => g.sliders);

  const sliderRow = s => `
    <div class="ctl-row" data-sid="${s.sid}" data-search="${esc(s.label.toLowerCase())}">
      <div class="ctl-label"><div class="t">${esc(s.label)}</div><div class="s">${esc(s.sub)}</div></div>
      <div class="ctl-input">
        <input type="range" class="sld" id="sl-${s.sid}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.get()}" aria-label="${esc(s.label)}">
        <span class="readout" id="ro-${s.sid}">${s.fmt(s.get())}</span>
      </div>
    </div>`;

  function renderAppearance(pane) {
    const a = cfg.appearance;
    pane.innerHTML = `
      <h1>Appearance</h1>
      <p class="tab-desc">Bloom has one look. Tune its size, spacing and accent — the live preview updates as you go.</p>
      <div class="appearance-cols">
        <div class="appearance-controls">
          <h2 class="sec">Accent</h2>
          <div class="card">
            <div class="ctl-row" data-sid="accents" data-search="accent color">
              <div class="ctl-label"><div class="t">Highlight color</div><div class="s">The one accent — the lit wedge and focus</div></div>
              <div class="ctl-input">
                <span class="swatch-wrap"><input type="color" class="swatch" id="acc-a" value="${esc(a.accentA)}" aria-label="Accent"><input class="in hex mono" id="acc-a-hex" value="${esc(a.accentA)}" aria-label="Accent hex"></span>
              </div>
            </div>
          </div>
          ${SLIDER_GROUPS.map(g => `
            <h2 class="sec">${esc(g.title)}</h2>
            <div class="card">${g.sliders.map(sliderRow).join('')}</div>`).join('')}
        </div>
        <div class="preview-stick">
          <div id="preview" aria-hidden="true"></div>
          <p class="hint" style="text-align:center;margin-top:10px">Live preview</p>
        </div>
      </div>`;

    renderPreview();

    // accentB mirrors accentA so gradient-reading code stays flat
    {
      const c = $('#acc-a', pane), h = $('#acc-a-hex', pane);
      const apply = v => {
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
        c.value = v; h.value = v.toUpperCase();
        cfg.appearance.accentA = cfg.appearance.accentB = v;
        applyAccent(v); // recolor the settings UI live
        renderPreview();
        debouncedPatch('acc', { appearance: { accentA: v, accentB: v } });
      };
      c.addEventListener('input', e => apply(e.target.value));
      h.addEventListener('change', e => apply(e.target.value.trim()));
    }

    ALL_SLIDERS.forEach(s => {
      const el = $('#sl-' + s.sid, pane);
      const ro = $('#ro-' + s.sid, pane);
      const paint = () => { el.style.setProperty('--pct', ((el.value - s.min) / (s.max - s.min)) * 100 + '%'); };
      paint();
      el.addEventListener('input', () => {
        const v = Number(el.value);
        paint();
        ro.textContent = s.fmt(v);
        const part = s.set(v);
        if (part.appearance) Object.assign(cfg.appearance, part.appearance);
        if (part.bud) Object.assign(cfg.bud, part.bud);
        renderPreview();
        debouncedPatch('sl-' + s.sid, part);
      });
    });
  }

  function hexA(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})` : `rgba(91,140,255,${alpha})`;
  }

  // Preview mirrors the real overlay dial, sized by live appearance values.
  const PV_ICONS = ['globe', 'terminal', 'camera', 'music', 'folder', 'zap', 'grid'];
  function renderPreview() {
    const pv = $('#preview');
    if (!pv) return;
    const a = cfg.appearance;
    const acc = /^#[0-9a-fA-F]{6}$/.test(a.accentA) ? a.accentA : '#5b8cff';
    const S = 250, c = S / 2;
    const mid = 34 + (a.ringRadius - 96) / (180 - 96) * 58; // map radius → preview
    const th = 18 + (a.nodeSize - 38) / (60 - 38) * 22;
    const rOut = mid + th / 2, rIn = Math.max(26, mid - th / 2);
    const budR = Math.max(9, cfg.bud.size * 0.32);
    const N = 7, hot = 1;
    const pt = (r, ang) => [c + r * Math.cos(ang), c + r * Math.sin(ang)];
    const sector = (a0, a1) => {
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const [x0o, y0o] = pt(rOut, a0), [x1o, y1o] = pt(rOut, a1);
      const [x1i, y1i] = pt(rIn, a1), [x0i, y0i] = pt(rIn, a0);
      return `M${x0o.toFixed(1)} ${y0o.toFixed(1)} A${rOut} ${rOut} 0 ${large} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)}`
        + ` L${x1i.toFixed(1)} ${y1i.toFixed(1)} A${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
    };
    let seg = '';
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + (i / N) * Math.PI * 2, a1 = -Math.PI / 2 + ((i + 1) / N) * Math.PI * 2;
      const on = i === hot;
      seg += `<path d="${sector(a0, a1)}" fill="${on ? hexA(acc, 0.7) : 'rgba(255,255,255,0.045)'}" stroke="${on ? acc : 'rgba(255,255,255,0.14)'}" stroke-width="1"/>`;
      const [ix, iy] = pt((rIn + rOut) / 2, (a0 + a1) / 2);
      seg += `<g transform="translate(${(ix - 8).toFixed(1)},${(iy - 8).toFixed(1)})" style="color:${on ? '#fff' : 'rgba(255,255,255,0.55)'}">${icon(PV_ICONS[i % PV_ICONS.length], 16)}</g>`;
    }
    const dim = a.dim ?? 0.35;
    pv.innerHTML = `
      <div class="pv-dim" style="opacity:${dim}"></div>
      <svg class="pv-svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" fill="none">
        ${seg}
        <circle cx="${c}" cy="${c}" r="${budR.toFixed(1)}" fill="#1a1b1d" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" opacity="${cfg.bud.idleOpacity}"/>
        <g transform="translate(${(c - budR * 0.62).toFixed(1)},${(c - budR * 0.62).toFixed(1)})" style="color:${acc}" opacity="${cfg.bud.idleOpacity}">${icon('bloom', Math.round(budR * 1.24))}</g>
      </svg>`;
  }

  // ==== HOTKEYS TAB ====
  // Deep-merge can't delete keys, so removed quickfire entries are nulled and filtered.
  function liveQuickfire() {
    return Object.entries(cfg.quickfire || {}).filter(([, acc]) => !!acc);
  }

  function allBindings(excludeKey) {
    const out = [];
    if (excludeKey !== 'toggleRing' && cfg.hotkeys.toggleRing) out.push({ acc: cfg.hotkeys.toggleRing, name: 'Summon ring' });
    if (excludeKey !== 'palette' && cfg.hotkeys.palette) out.push({ acc: cfg.hotkeys.palette, name: 'Command palette' });
    if (excludeKey !== 'dictate' && cfg.hotkeys.dictate) out.push({ acc: cfg.hotkeys.dictate, name: 'Dictate' });
    if (excludeKey !== 'speak' && cfg.hotkeys.speak) out.push({ acc: cfg.hotkeys.speak, name: 'Read aloud' });
    for (const [id, acc] of liveQuickfire()) {
      if (excludeKey === 'qf:' + id) continue;
      const n = findNode(id);
      out.push({ acc, name: n ? n.label : id });
    }
    return out;
  }

  function chipsHTML(acc) {
    if (!acc) return `<span class="ph">Click to set…</span>`;
    return acc.split('+').map(k => `<span class="key-chip">${esc(k)}</span>`).join('');
  }

  function keyName(e) {
    const k = e.key;
    if (k === ' ') return 'Space';
    if (k === 'ArrowUp') return 'Up';
    if (k === 'ArrowDown') return 'Down';
    if (k === 'ArrowLeft') return 'Left';
    if (k === 'ArrowRight') return 'Right';
    if (/^[a-z]$/i.test(k)) return k.toUpperCase();
    if (/^[0-9]$/.test(k)) return k;
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k;
    if (['Enter', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert'].includes(k)) return k;
    if (k.length === 1) return k.toUpperCase();
    return null;
  }

  // wires a keycap element: click to capture; onDone(acc) called on success
  function wireKeycap(el, opts) {
    const errEl = opts.errEl;
    function showErr(msg) {
      el.classList.remove('err'); void el.offsetWidth; el.classList.add('err');
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
    }
    el.addEventListener('click', () => {
      if (capturing) return;
      capturing = true;
      el.classList.add('capturing');
      el.innerHTML = `<span class="ph">Press keys… Esc cancels</span>`;
      if (errEl) errEl.hidden = true;
      function stop(restore) {
        capturing = false;
        el.classList.remove('capturing');
        document.removeEventListener('keydown', onKey, true);
        if (restore) el.innerHTML = chipsHTML(opts.current());
      }
      function onKey(e) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { stop(true); return; }
        const mods = [];
        if (e.ctrlKey) mods.push('Control');
        if (e.altKey) mods.push('Alt');
        if (e.shiftKey) mods.push('Shift');
        if (e.metaKey) mods.push('Super');
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
          el.innerHTML = mods.map(m => `<span class="key-chip">${m}</span>`).join('') + `<span class="ph">…</span>`;
          return;
        }
        const key = keyName(e);
        if (!key) return;
        if (!mods.length) { showErr('Global hotkeys need at least one modifier (Ctrl / Alt / Shift / Super).'); stop(true); return; }
        const acc = mods.concat(key).join('+');
        const clash = allBindings(opts.excludeKey).find(b => b.acc === acc);
        if (clash) { showErr(`Already bound to "${clash.name}"`); stop(true); return; }
        stop(false);
        el.innerHTML = chipsHTML(acc);
        opts.onDone(acc);
      }
      document.addEventListener('keydown', onKey, true);
    });
    el.innerHTML = chipsHTML(opts.current());
  }

  let qfPending = []; // rows added but not yet bound: [{nodeId}]

  function leafOptions(selectedId) {
    return `<option value="">— none —</option>` + allLeaves().map(n =>
      `<option value="${n.id}" ${n.id === selectedId ? 'selected' : ''}>${esc(n.label)} · ${esc(breadcrumb(n.id).join(' › ') || 'Root')}</option>`).join('');
  }

  function renderHotkeys(pane) {
    const b = cfg.behavior || {};
    const v = cfg.voice || {};
    pane.innerHTML = `
      <h1>Hotkeys &amp; Input</h1>
      <p class="tab-desc">Summon Bloom from anywhere. If you press a combination Bloom already uses, it tells you which action has it instead of silently overwriting it.</p>
      <h2 class="sec first">Global shortcuts</h2>
      <div class="card">
        <div class="ctl-row" data-sid="hk-ring" data-search="summon ring hotkey">
          <div class="ctl-label"><div class="t">Summon ring</div><div class="s">Opens the root ring from any app</div></div>
          <div class="ctl-input" style="flex-direction:column;align-items:flex-end;gap:4px">
            <button class="keycap" id="kc-ring" aria-label="Summon ring hotkey"></button>
            <span class="hint-err" id="kc-ring-err" hidden></span>
          </div>
        </div>
        <div class="ctl-row" data-sid="hk-palette" data-search="command palette hotkey">
          <div class="ctl-label"><div class="t">Command palette</div><div class="s">Search every action by name</div></div>
          <div class="ctl-input" style="flex-direction:column;align-items:flex-end;gap:4px">
            <button class="keycap" id="kc-palette" aria-label="Command palette hotkey"></button>
            <span class="hint-err" id="kc-palette-err" hidden></span>
          </div>
        </div>
        <div class="ctl-row" data-sid="hk-dictate" data-search="dictate voice speech to text hotkey">
          <div class="ctl-label"><div class="t">Dictate (speech → text)</div><div class="s">Start/stop dictation anywhere; text lands at your cursor</div></div>
          <div class="ctl-input" style="flex-direction:column;align-items:flex-end;gap:4px">
            <button class="keycap" id="kc-dictate" aria-label="Dictate hotkey"></button>
            <span class="hint-err" id="kc-dictate-err" hidden></span>
          </div>
        </div>
        <div class="ctl-row" data-sid="hk-speak" data-search="read aloud text to speech hotkey">
          <div class="ctl-label"><div class="t">Read aloud (text → speech)</div><div class="s">Speaks the text you have selected</div></div>
          <div class="ctl-input" style="flex-direction:column;align-items:flex-end;gap:4px">
            <button class="keycap" id="kc-speak" aria-label="Read aloud hotkey"></button>
            <span class="hint-err" id="kc-speak-err" hidden></span>
          </div>
        </div>
      </div>

      <h2 class="sec">Quick-fire hotkeys</h2>
      <div class="card" data-sid="quickfire" data-search="quick fire action hotkeys">
        <div id="qf-rows"></div>
        <button class="btn" id="qf-add" style="margin-top:10px">${icon('plus', 13)} Add quick-fire hotkey</button>
      </div>

      <h2 class="sec">Behavior</h2>
      <div class="card">
        <div class="ctl-row" data-sid="hoverOpenDelay" data-search="hover open delay sub ring">
          <div class="ctl-label"><div class="t">Hover to open sub-ring delay</div></div>
          <div class="ctl-input">
            <input type="range" class="sld" id="hk-hover" min="100" max="600" step="10" value="${b.hoverOpenDelay || 240}" aria-label="Hover open delay">
            <span class="readout" id="hk-hover-ro">${b.hoverOpenDelay || 240}ms</span>
          </div>
        </div>
        ${[
          { sid: 'scrollCycle', label: 'Scroll over bud cycles pinned actions', key: 'scrollCycle', obj: 'behavior' },
          { sid: 'edgeSnap', label: 'Snap bud to screen edges', key: 'edgeSnap', obj: 'behavior' },
          { sid: 'budPinned', label: 'Pin bud position', sub: 'Disables dragging', key: 'pinned', obj: 'bud' }
        ].map(t => `
          <div class="ctl-row" data-sid="${t.sid}" data-search="${esc(t.label.toLowerCase())}">
            <div class="ctl-label"><div class="t">${esc(t.label)}</div>${t.sub ? `<div class="s">${esc(t.sub)}</div>` : ''}</div>
            <div class="ctl-input"><label class="tgl"><input type="checkbox" data-bkey="${t.obj}.${t.key}" ${(t.obj === 'bud' ? cfg.bud : b)[t.key] ? 'checked' : ''} aria-label="${esc(t.label)}"><span class="knob"></span></label></div>
          </div>`).join('')}
      </div>

      <h2 class="sec">Voice &amp; gestures</h2>
      <p class="tab-desc" style="margin:-6px 0 14px">Pick what a double-tap and a hold on the bud do. The speech model downloads once on first use.</p>
      <div class="card">
        <div class="ctl-row" data-sid="dblAction" data-search="double tap double click action dictate favourite favorite">
          <div class="ctl-label"><div class="t">Double-tap the bud</div><div class="s">Two quick taps</div></div>
          <div class="ctl-input">
            <select class="in sel" id="vo-dbl" style="width:170px">
              <option value="dictate" ${(b.doubleClickAction || 'dictate') === 'dictate' ? 'selected' : ''}>Dictate (speech → text)</option>
              <option value="favorite" ${b.doubleClickAction === 'favorite' ? 'selected' : ''}>Run a favourite</option>
            </select>
          </div>
        </div>
        <div class="ctl-row" data-sid="dblFav" id="vo-dbl-fav-row" data-search="double tap favourite favorite action" ${b.doubleClickAction === 'favorite' ? '' : 'hidden'}>
          <div class="ctl-label"><div class="t">Double-tap favourite</div><div class="s">Action to run</div></div>
          <div class="ctl-input"><select class="in sel" id="vo-dbl-fav" style="width:220px">${leafOptions(cfg.favoriteId)}</select></div>
        </div>
        <div class="ctl-row" data-sid="holdAction" data-search="hold press action read aloud speak favourite favorite">
          <div class="ctl-label"><div class="t">Hold the bud</div><div class="s">Press and keep held</div></div>
          <div class="ctl-input">
            <select class="in sel" id="vo-hold" style="width:170px">
              <option value="speak" ${(b.holdAction || 'speak') === 'speak' ? 'selected' : ''}>Read aloud (selection)</option>
              <option value="favorite" ${b.holdAction === 'favorite' ? 'selected' : ''}>Run a favourite</option>
            </select>
          </div>
        </div>
        <div class="ctl-row" data-sid="holdFav" id="vo-hold-fav-row" data-search="hold favourite favorite action" ${b.holdAction === 'favorite' ? '' : 'hidden'}>
          <div class="ctl-label"><div class="t">Hold favourite</div><div class="s">Action to run</div></div>
          <div class="ctl-input"><select class="in sel" id="vo-hold-fav" style="width:220px">${leafOptions(cfg.holdFavoriteId)}</select></div>
        </div>
      </div>

      <h2 class="sec">Voice engine</h2>
      <div class="card">
        <div class="ctl-row" data-sid="voModel" data-search="whisper model speech recognition size accuracy speed">
          <div class="ctl-label"><div class="t">Speech-to-text model</div><div class="s">Bigger = more accurate but slower. Downloads once.</div></div>
          <div class="ctl-input">
            <select class="in sel" id="vo-model" style="width:200px">
              ${['Xenova/whisper-tiny.en', 'Xenova/whisper-base.en', 'Xenova/whisper-small.en'].map(m =>
                `<option value="${m}" ${(v.model || 'Xenova/whisper-base.en') === m ? 'selected' : ''}>${m.split('/')[1].replace('whisper-', '').replace('.en', ' (English)')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="ctl-row" data-sid="voVoice" data-search="read aloud voice text to speech tts">
          <div class="ctl-label"><div class="t">Read-aloud voice</div><div class="s">From your system's speech engine</div></div>
          <div class="ctl-input"><select class="in sel" id="vo-voice" style="width:200px"><option value="">System default</option></select></div>
        </div>
        <div class="ctl-row" data-sid="voRate" data-search="read aloud speech rate speed">
          <div class="ctl-label"><div class="t">Read-aloud speed</div></div>
          <div class="ctl-input">
            <input type="range" class="sld" id="vo-rate" min="0.5" max="2" step="0.1" value="${v.ttsRate || 1}" aria-label="Read-aloud speed">
            <span class="readout" id="vo-rate-ro">${(v.ttsRate || 1).toFixed(1)}×</span>
          </div>
        </div>
      </div>

      <h2 class="sec">Ring shortcuts</h2>
      <div class="card" data-sid="cheat" data-search="ring shortcuts cheat sheet keyboard">
        <div class="cheat">
          <span><span class="key-chip">←</span> <span class="key-chip">→</span></span><span>rotate the ring</span>
          <span class="key-chip">Enter</span><span>drill in / run</span>
          <span class="key-chip">Esc</span><span>back one layer</span>
          <span class="key-chip">Home</span><span>jump to root</span>
          <span><span class="key-chip">1</span>–<span class="key-chip">9</span></span><span>pick a node directly</span>
          <span class="key-chip">?</span><span>show this cheat sheet over the ring</span>
        </div>
      </div>`;

    wireKeycap($('#kc-ring', pane), {
      current: () => cfg.hotkeys.toggleRing, excludeKey: 'toggleRing', errEl: $('#kc-ring-err', pane),
      onDone: acc => patch({ hotkeys: { toggleRing: acc } })
    });
    wireKeycap($('#kc-palette', pane), {
      current: () => cfg.hotkeys.palette, excludeKey: 'palette', errEl: $('#kc-palette-err', pane),
      onDone: acc => patch({ hotkeys: { palette: acc } })
    });

    const hover = $('#hk-hover', pane);
    const hoverRo = $('#hk-hover-ro', pane);
    const paintH = () => hover.style.setProperty('--pct', ((hover.value - 100) / 500) * 100 + '%');
    paintH();
    hover.addEventListener('input', () => {
      paintH(); hoverRo.textContent = hover.value + 'ms';
      debouncedPatch('hover', { behavior: { hoverOpenDelay: Number(hover.value) } });
    });
    $$('[data-bkey]', pane).forEach(t => t.addEventListener('change', () => {
      const [obj, key] = t.dataset.bkey.split('.');
      patch({ [obj]: { [key]: t.checked } });
    }));

    $('#qf-add', pane).addEventListener('click', () => { qfPending.push({ nodeId: null }); renderQfRows(); });
    renderQfRows();

    // ---- voice hotkeys ----
    wireKeycap($('#kc-dictate', pane), {
      current: () => cfg.hotkeys.dictate, excludeKey: 'dictate', errEl: $('#kc-dictate-err', pane),
      onDone: acc => patch({ hotkeys: { dictate: acc } })
    });
    wireKeycap($('#kc-speak', pane), {
      current: () => cfg.hotkeys.speak, excludeKey: 'speak', errEl: $('#kc-speak-err', pane),
      onDone: acc => patch({ hotkeys: { speak: acc } })
    });

    // ---- voice & gesture selects ----
    $('#vo-dbl', pane).addEventListener('change', e => {
      $('#vo-dbl-fav-row', pane).hidden = e.target.value !== 'favorite';
      patch({ behavior: { doubleClickAction: e.target.value } });
    });
    $('#vo-hold', pane).addEventListener('change', e => {
      $('#vo-hold-fav-row', pane).hidden = e.target.value !== 'favorite';
      patch({ behavior: { holdAction: e.target.value } });
    });
    $('#vo-dbl-fav', pane).addEventListener('change', e => patch({ favoriteId: e.target.value || null }).then(renderTree));
    $('#vo-hold-fav', pane).addEventListener('change', e => patch({ holdFavoriteId: e.target.value || null }));
    $('#vo-model', pane).addEventListener('change', e => patch({ voice: { model: e.target.value } }));

    const rate = $('#vo-rate', pane), rateRo = $('#vo-rate-ro', pane);
    const paintR = () => rate.style.setProperty('--pct', ((rate.value - 0.5) / 1.5) * 100 + '%');
    paintR();
    rate.addEventListener('input', () => {
      paintR(); rateRo.textContent = Number(rate.value).toFixed(1) + '×';
      debouncedPatch('vrate', { voice: { ttsRate: Number(rate.value) } });
    });

    // Populate the read-aloud voice picker from the OS speech engine.
    const voiceSel = $('#vo-voice', pane);
    bloom.listVoices().then(list => {
      if (!voiceSel.isConnected) return;
      voiceSel.innerHTML = `<option value="">System default</option>` +
        (list || []).map(vo => `<option value="${esc(vo.id)}" ${vo.id === v.ttsVoice ? 'selected' : ''}>${esc(vo.label)}</option>`).join('');
    }).catch(() => {});
    voiceSel.addEventListener('change', e => { patch({ voice: { ttsVoice: e.target.value } }); bloom.previewVoice(e.target.value); });
  }

  function renderQfRows() {
    const wrap = $('#qf-rows');
    if (!wrap) return;
    const rows = liveQuickfire().map(([nodeId, acc]) => ({ nodeId, acc, pending: false }))
      .concat(qfPending.map(p => ({ nodeId: p.nodeId, acc: null, pending: true })));
    wrap.innerHTML = rows.length ? '' : `<div class="hint">No quick-fire hotkeys yet — bind your most-used actions straight to a key.</div>`;
    rows.forEach((r, i) => {
      const node = r.nodeId ? findNode(r.nodeId) : null;
      const row = document.createElement('div');
      row.className = 'qf-row';
      row.innerHTML = `
        <div class="qf-picker">
          <button class="btn" data-qf-pick>${node ? `${icon(node.icon, 14)} <span style="overflow:hidden;text-overflow:ellipsis">${esc(node.label)}</span> <span class="hint">${esc(breadcrumb(node.id).join(' › '))}</span>` : 'Pick an action…'}</button>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
          <button class="keycap" data-qf-cap ${r.nodeId ? '' : 'disabled'} aria-label="Hotkey"></button>
          <span class="hint-err" data-qf-err hidden></span>
        </div>
        <button class="icon-btn danger" data-qf-rm title="Remove" aria-label="Remove">${icon('x', 14)}</button>`;
      wrap.appendChild(row);

      const pIdx = i - liveQuickfire().length; // index into qfPending for pending rows
      $('[data-qf-pick]', row).addEventListener('click', () => openLeafPicker(row, picked => {
        if (r.pending) { qfPending[pIdx] = { nodeId: picked.id }; renderQfRows(); return; }
        // changing the action of an existing binding: move accelerator to the new node
        patch({ quickfire: { [r.nodeId]: null, [picked.id]: r.acc } }).then(renderQfRows);
      }));

      const cap = $('[data-qf-cap]', row);
      wireKeycap(cap, {
        current: () => r.acc, excludeKey: 'qf:' + (r.nodeId || ''), errEl: $('[data-qf-err]', row),
        onDone: acc => {
          if (!r.nodeId) return;
          const wasPending = r.pending;
          patch({ quickfire: { [r.nodeId]: acc } }).then(() => {
            if (wasPending) qfPending = qfPending.filter(p => p.nodeId !== r.nodeId);
            renderQfRows();
          });
        }
      });

      $('[data-qf-rm]', row).addEventListener('click', () => {
        if (r.pending) { qfPending.splice(pIdx, 1); renderQfRows(); return; }
        patch({ quickfire: { [r.nodeId]: null } }).then(renderQfRows);
      });
    });
  }

  function openLeafPicker(anchorRow, onPick) {
    const old = $('.qf-menu'); if (old) old.remove();
    const menu = document.createElement('div');
    menu.className = 'qf-menu';
    menu.innerHTML = `<input class="in" placeholder="Search actions…" aria-label="Search actions"><div data-list></div>`;
    $('.qf-picker', anchorRow).appendChild(menu);
    const input = $('input', menu);
    const list = $('[data-list]', menu);
    const leaves = allLeaves();
    function draw(q) {
      const hits = leaves.filter(n => !q || (n.label || '').toLowerCase().includes(q));
      list.innerHTML = hits.map(n => `
        <button class="gs-item" data-id="${esc(n.id)}">${icon(n.icon, 15)}
          <span class="gs-item-text"><div class="gs-item-label">${esc(n.label)}</div>
          <div class="gs-item-sub">${esc(breadcrumb(n.id).join(' › ') || 'Root')}</div></span></button>`).join('')
        || `<div class="gs-empty">No matches</div>`;
      $$('.gs-item', list).forEach(b => b.addEventListener('click', () => { const n = findNode(b.dataset.id); menu.remove(); onPick(n); }));
    }
    input.addEventListener('input', e => draw(e.target.value.trim().toLowerCase()));
    draw('');
    input.focus();
    setTimeout(() => {
      const away = ev => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', away); } };
      document.addEventListener('mousedown', away);
    }, 0);
  }

  // ==== PROFILES TAB ====
  function snapshotProfile() {
    return deepClone({ root: cfg.root, favoriteId: cfg.favoriteId, holdFavoriteId: cfg.holdFavoriteId, pinnedIds: cfg.pinnedIds, appearance: cfg.appearance });
  }
  function savedProfiles() {
    const out = {};
    for (const [k, v] of Object.entries((cfg.profiles && cfg.profiles.saved) || {})) if (v) out[k] = v;
    return out;
  }

  function renderProfiles(pane) {
    const active = (cfg.profiles && cfg.profiles.active) || 'Default';
    const saved = savedProfiles();
    const names = Array.from(new Set([active, ...Object.keys(saved)]));
    pane.innerHTML = `
      <h1>Profiles</h1>
      <p class="tab-desc">A profile bundles your action tree, favorites and look.</p>
      <div class="card" data-sid="profiles-list" data-search="profiles switch">
        ${names.map(name => `
          <div class="profile-row" data-name="${esc(name)}">
            ${icon('clipboard', 16)}
            <span class="profile-name">${esc(name)}</span>
            ${name === active ? `<span class="chip-active">active</span>` : ''}
            <span class="tr-spring" style="flex:1"></span>
            ${name !== active ? `<button class="btn btn-sm" data-p="switch">Switch</button>` : ''}
            <button class="btn btn-sm" data-p="rename">Rename</button>
            <button class="btn btn-sm" data-p="dup">Duplicate</button>
            ${name !== active ? `<button class="btn btn-sm btn-danger" data-p="del">Delete</button>` : ''}
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" id="profile-new" style="margin-top:12px">${icon('plus', 14)} New profile</button>`;

    $('#profile-new', pane).addEventListener('click', () => promptName('New profile', 'Profile name', '', async name => {
      if (!name || names.includes(name)) { toast(name ? 'That name is taken.' : 'Name required.', { kind: 'bad' }); return; }
      await patch({ profiles: { saved: { [name]: snapshotProfile() } } });
      renderTab('profiles');
      toast(`Saved current setup as "${name}"`, { kind: 'ok' });
    }));

    $$('.profile-row', pane).forEach(row => {
      const name = row.dataset.name;
      const isActive = name === active;
      row.querySelectorAll('[data-p]').forEach(btn => btn.addEventListener('click', async () => {
        const act = btn.dataset.p;
        if (act === 'switch') {
          const target = saved[name];
          if (!target) return;
          const newSaved = { ...savedProfiles(), [active]: snapshotProfile() };
          // one atomic patch: save current under old name, activate target, hoist its data
          await patch({
            profiles: { active: name, saved: newSaved },
            root: target.root, favoriteId: target.favoriteId ?? null, holdFavoriteId: target.holdFavoriteId ?? null,
            pinnedIds: target.pinnedIds || [], appearance: target.appearance
          });
          renderTab('profiles');
          toast(`Switched to "${name}"`, { kind: 'ok' });
        } else if (act === 'rename') {
          promptName('Rename profile', 'New name', name, async newName => {
            if (!newName || newName === name) return;
            if (names.includes(newName)) { toast('That name is taken.', { kind: 'bad' }); return; }
            const part = { profiles: { saved: {} } };
            if (saved[name]) { part.profiles.saved[newName] = saved[name]; part.profiles.saved[name] = null; }
            if (isActive) part.profiles.active = newName;
            await patch(part);
            renderTab('profiles');
          });
        } else if (act === 'dup') {
          const data = isActive ? snapshotProfile() : saved[name];
          let copy = name + ' copy', i = 2;
          while (names.includes(copy)) copy = name + ' copy ' + i++;
          await patch({ profiles: { saved: { [copy]: deepClone(data) } } });
          renderTab('profiles');
        } else if (act === 'del') {
          const ok = await confirmModal('Delete profile', `Delete "${name}"? This can't be undone.`, 'Delete', true);
          if (!ok) return;
          await patch({ profiles: { saved: { [name]: null } } });
          renderTab('profiles');
          toast(`Deleted "${name}"`);
        }
      }));
    });
  }

  function promptName(title, label, initial, onDone) {
    const { modal, close } = openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <div class="modal-body"><div class="f-field"><label>${esc(label)}</label>
        <input class="in" id="pn-input" value="${esc(initial)}" maxlength="40"></div></div>
      <div class="modal-foot"><span class="spring"></span>
        <button class="btn" id="pn-cancel">Cancel</button>
        <button class="btn btn-primary" id="pn-ok">Save</button></div>`);
    const input = $('#pn-input', modal);
    const done = () => { const v = input.value.trim(); close(); onDone(v); };
    $('#pn-cancel', modal).addEventListener('click', close);
    $('#pn-ok', modal).addEventListener('click', done);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  }

  // ==== GENERAL TAB ====
  function renderGeneral(pane) {
    const showOnStartup = cfg.behavior && cfg.behavior.showOnStartup !== false; // default true
    const isWin = bloom.getPlatform() === 'win32';
    pane.innerHTML = `
      <h1>General &amp; Startup</h1>
      <p class="tab-desc">How Bloom starts, and where its one config file lives.</p>
      <h2 class="sec first">Startup</h2>
      <div class="card">
        <div class="ctl-row" data-sid="autostart" data-search="launch at login autostart">
          <div class="ctl-label"><div class="t">Launch Bloom at login</div></div>
          <div class="ctl-input"><label class="tgl"><input type="checkbox" id="g-autostart" disabled aria-label="Launch at login"><span class="knob"></span></label></div>
        </div>
        <div class="ctl-row" data-sid="showOnStartup" data-search="show bud on start">
          <div class="ctl-label"><div class="t">Show bud on start</div></div>
          <div class="ctl-input"><label class="tgl"><input type="checkbox" id="g-show" ${showOnStartup ? 'checked' : ''} aria-label="Show bud on start"><span class="knob"></span></label></div>
        </div>
      </div>
      <h2 class="sec">Configuration</h2>
      <div class="card">
        <div class="ctl-row" data-sid="export" data-search="export configuration backup">
          <div class="ctl-label"><div class="t">Export configuration…</div><div class="s">One JSON file — actions, looks, hotkeys</div></div>
          <div class="ctl-input"><button class="btn" id="g-export">${icon('download', 14)} Export</button></div>
        </div>
        <div class="ctl-row" data-sid="import" data-search="import configuration restore">
          <div class="ctl-label"><div class="t">Import configuration…</div><div class="s">Replaces your current config</div></div>
          <div class="ctl-input"><button class="btn" id="g-import">${icon('upload', 14)} Import</button></div>
        </div>
        <div class="ctl-row">
          <div class="ctl-label"><div class="t">Config location</div>
            <div class="s mono">${isWin ? '%APPDATA%\\Bloom\\config.json' : '~/.config/bloom/config.json'}</div></div>
        </div>
      </div>
      <h2 class="sec" style="color:var(--danger)">Danger zone</h2>
      <div class="card danger-card" data-sid="reset" data-search="reset to defaults">
        <div class="ctl-row">
          <div class="ctl-label"><div class="t">Reset to defaults</div><div class="s">Wipes your tree, looks and hotkeys</div></div>
          <div class="ctl-input"><button class="btn btn-danger" id="g-reset">Reset…</button></div>
        </div>
      </div>`;

    const auto = $('#g-autostart', pane);
    bloom.getAutostart().then(v => { auto.checked = !!v; auto.disabled = false; }).catch(() => { auto.disabled = false; });
    auto.addEventListener('change', async () => {
      try { await bloom.setAutostart(auto.checked); }
      catch (e) { auto.checked = !auto.checked; toast('Could not change autostart: ' + (e.message || e), { kind: 'bad' }); }
    });
    $('#g-show', pane).addEventListener('change', e => patch({ behavior: { showOnStartup: e.target.checked } }));
    $('#g-export', pane).addEventListener('click', async () => {
      const r = await bloom.exportConfig();
      if (r && r.path) toast('Exported to ' + r.path, { kind: 'ok' });
      else if (r && r.error) toast('Export failed: ' + r.error, { kind: 'bad' });
    });
    $('#g-import', pane).addEventListener('click', async () => {
      const r = await bloom.importConfig();
      if (r && r.ok) toast('Imported — config replaced', { kind: 'ok' });
      else if (r && r.error) toast('Import failed: ' + r.error, { kind: 'bad' });
    });
    $('#g-reset', pane).addEventListener('click', async () => {
      const ok = await confirmModal('Reset to defaults', 'This wipes your action tree, appearance and hotkeys. Your config file gets a backup, but the app returns to factory state.', 'Reset all', true);
      if (!ok) return;
      await patch({ __reset: true });
      toast('Reset to defaults', { kind: 'ok' });
      rerenderCurrent();
    });
  }

  // ==== ABOUT TAB ====
  function renderAbout(pane) {
    const u = cfg.updates || {};
    pane.innerHTML = `
      <div class="card about-card" data-sid="about-card" data-search="about version updates">
        <span class="about-glyph">${BloomIcons.logo(72, { strokeWidth: 2.4 })}</span>
        <div class="about-name">Bloom</div>
        <div class="about-tag">Your desktop, one bloom away.</div>
        <div class="about-meta">Version <span id="ab-version">…</span></div>
        <div class="about-actions">
          <button class="btn" id="ab-onboard">${icon('sparkle', 14)} Replay onboarding</button>
          <button class="btn" id="ab-cheat">${icon('keyboard', 14)} View shortcut cheat-sheet</button>
        </div>
      </div>

      <h2 class="sec">Updates</h2>
      <div class="card" data-sid="updates" data-search="update check download install version channel beta auto">
        <div class="ctl-row">
          <div class="ctl-label"><div class="t">Software update</div><div class="s" id="up-status">Bloom is up to date.</div></div>
          <div class="ctl-input" style="min-width:190px;justify-content:flex-end">
            <div class="up-progress" id="up-progress" hidden><div class="up-bar" id="up-bar"></div></div>
            <button class="btn btn-primary" id="up-btn">${icon('refresh', 13)} Check for updates</button>
          </div>
        </div>
        <div class="ctl-row" data-search="update automatic check launch">
          <div class="ctl-label"><div class="t">Check automatically on launch</div></div>
          <div class="ctl-input"><label class="tgl"><input type="checkbox" id="up-auto" ${u.autoCheck !== false ? 'checked' : ''} aria-label="Auto-check"><span class="knob"></span></label></div>
        </div>
        <div class="ctl-row" data-search="update channel stable beta prerelease">
          <div class="ctl-label"><div class="t">Update channel</div><div class="s">Beta receives pre-releases</div></div>
          <div class="ctl-input"><select class="in sel" id="up-channel" style="width:140px">
            <option value="stable" ${(u.channel || 'stable') === 'stable' ? 'selected' : ''}>Stable</option>
            <option value="beta" ${u.channel === 'beta' ? 'selected' : ''}>Beta</option>
          </select></div>
        </div>
      </div>`;
    const setVer = v => { const el = $('#ab-version', pane); if (el) el.textContent = v; };
    bloom.getVersion().then(setVer).catch(() => setVer('dev'));
    $('#ab-onboard', pane).addEventListener('click', () => { bloom.relaunchOnboarding(); toast('Onboarding will replay', { kind: 'ok' }); });
    $('#ab-cheat', pane).addEventListener('click', () => {
      switchTab('hotkeys');
      const el = $('[data-sid="cheat"]');
      if (el) flashControl(el);
    });

    // ---- updates state machine ----
    const btn = $('#up-btn', pane), statusEl = $('#up-status', pane);
    const prog = $('#up-progress', pane), bar = $('#up-bar', pane);
    let mode = 'idle', newVersion = '';
    const paint = () => {
      prog.hidden = mode !== 'downloading';
      btn.disabled = mode === 'checking' || mode === 'downloading';
      btn.innerHTML =
        mode === 'checking' ? `${icon('refresh', 13)} Checking…`
        : mode === 'available' ? `${icon('download', 13)} Download v${esc(newVersion)}`
        : mode === 'downloading' ? `${icon('download', 13)} Downloading…`
        : mode === 'ready' ? `${icon('check', 13)} Restart &amp; install`
        : `${icon('refresh', 13)} Check for updates`;
    };
    btn.addEventListener('click', () => {
      if (mode === 'idle') { mode = 'checking'; statusEl.textContent = 'Checking for updates…'; paint(); bloom.updateCheck(); }
      else if (mode === 'available') { mode = 'downloading'; bloom.updateDownload(); paint(); }
      else if (mode === 'ready') { bloom.updateInstall(); }
    });
    $('#up-auto', pane).addEventListener('change', e => patch({ updates: { autoCheck: e.target.checked } }));
    $('#up-channel', pane).addEventListener('change', e => patch({ updates: { channel: e.target.value } }));

    aboutUpdateHandler = (s) => {
      if (!$('#up-btn')) return;                    // tab navigated away
      const info = s.info || {};
      if (s.event === 'checking') { mode = 'checking'; statusEl.textContent = 'Checking for updates…'; }
      else if (s.event === 'available') { mode = 'available'; newVersion = info.version || ''; statusEl.textContent = `Version ${newVersion} is available.`; }
      else if (s.event === 'none') { mode = 'idle'; statusEl.textContent = 'Bloom is up to date.'; }
      else if (s.event === 'progress') { mode = 'downloading'; bar.style.width = (info.percent || 0).toFixed(0) + '%'; statusEl.textContent = `Downloading… ${(info.percent || 0).toFixed(0)}%`; }
      else if (s.event === 'downloaded') { mode = 'ready'; statusEl.textContent = `Version ${info.version || newVersion} ready to install.`; }
      else if (s.event === 'error') { mode = 'idle'; statusEl.textContent = info.message || 'Update check failed.'; }
      paint();
    };
    paint();
  }

  // ---- boot ----
  async function boot() {
    cfg = await bloom.getConfig();
    applyAccent(cfg.appearance.accentA);
    $('#app-glyph').innerHTML = BloomIcons.logo(26, { strokeWidth: 2.8 });
    $('.gs-icon').innerHTML = icon('search', 14);
    $$('.rail-ic').forEach(el => { el.innerHTML = icon(el.dataset.ic, 16); });
    $$('.rail-item').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    const wc = { 'win-min': bloom.winMin, 'win-max': bloom.winMax, 'win-close': bloom.winClose };
    Object.entries(wc).forEach(([id, fn]) => { const el = $('#' + id); if (el) el.addEventListener('click', () => fn()); });
    setupGlobalSearch();

    bloom.on('config-changed', c => {
      cfg = c;
      applyAccent(cfg.appearance.accentA); // keep chrome accent in sync (e.g. profile switch)
      if (Date.now() - selfPatchAt < 500) return; // our own write; UI already updated
      rerenderCurrent();
    });
    bloom.on('settings-tab', t => switchTab(t));
    bloom.on('update-status', s => {
      if (aboutUpdateHandler) aboutUpdateHandler(s);
      if (s.event === 'available') toast(`Bloom ${s.info?.version || ''} available — see About & Updates`, { kind: 'ok' });
      else if (s.event === 'downloaded') toast('Update ready — restart to install (About)', { kind: 'ok' });
    });

    const saved = localStorage.getItem('bloom-settings-tab');
    switchTab(TABS.includes(saved) ? saved : 'actions');
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
