// Bloom bud window: a tiny always-interactive window that turns raw bud gestures
// (click, double-click, long-press, drag, wheel, right-click, file drop) into
// semantic commands for main.
'use strict';
(async function () {
  const budEl = document.getElementById('bud');
  let cfg = await window.bloom.getConfig();
  let ringOpen = false;

  const cmd = (c, extra) => window.bloom.budCmd({ cmd: c, ...extra });

  // appearance
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '94, 234, 212';
  }
  function applyAppearance() {
    const a = cfg.appearance, r = document.documentElement.style;
    r.setProperty('--acc-a', a.accentA); r.setProperty('--acc-b', a.accentB);
    r.setProperty('--acc-a-rgb', hexToRgb(a.accentA)); r.setProperty('--acc-b-rgb', hexToRgb(a.accentB));
    r.setProperty('--tint', a.reduceTransparency ? Math.max(a.tint, 0.85) : a.tint);
    r.setProperty('--sat', a.saturation + '%');
    // glow is clipped by the small window edge, so keep it modest
    r.setProperty('--glow', Math.min(a.glow, 0.5));
    r.setProperty('--bud', cfg.bud.size + 'px');
    r.setProperty('--idle-op', cfg.bud.idleOpacity);
    document.body.classList.toggle('flat', !!a.flat);
  }

  // tray icon: the Bloom mark, white lines on a dark disc
  function makeTrayIcon() {
    const c = document.createElement('canvas');
    c.width = c.height = 44;
    const g = c.getContext('2d');
    // dark disc backing
    const grad = g.createRadialGradient(18, 15, 2, 22, 22, 21);
    grad.addColorStop(0, '#2a2a2a'); grad.addColorStop(1, '#080808');
    g.fillStyle = grad;
    g.beginPath(); g.arc(22, 22, 21, 0, Math.PI * 2); g.fill();
    // clip to the disc, then stroke the five circles
    g.save();
    g.beginPath(); g.arc(22, 22, 20, 0, Math.PI * 2); g.clip();
    g.lineWidth = 1.6; g.strokeStyle = '#ffffff';
    const centers = [[22.0, 14.3], [29.3, 19.6], [26.5, 28.2], [17.5, 28.2], [14.7, 19.6]];
    for (const [x, y] of centers) { g.beginPath(); g.arc(x, y, 8.6, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    window.bloom.trayIcon(c.toDataURL('image/png'));
  }

  // input
  let drag = null, longTimer = null, clickTimer = null, suppressClick = false;
  let lastWheel = 0;
  let voiceState = 'idle';   // idle | listening | transcribing | speaking

  // hold gesture → read-aloud or the hold favourite
  function doHold() {
    if (cfg.behavior.holdAction === 'speak') cmd('speak');
    else cmd('hold-favorite');
  }

  budEl.addEventListener('pointerdown', e => {
    if (e.button === 1) { e.preventDefault(); cmd('hide'); return; }
    if (e.button !== 0) return;
    e.preventDefault();
    // grab offset from the bud center, in screen coordinates
    const centerX = window.screenX + innerWidth / 2;
    const centerY = window.screenY + innerHeight / 2;
    drag = { offX: e.screenX - centerX, offY: e.screenY - centerY, sx: e.screenX, sy: e.screenY, moved: false };
    clearTimeout(longTimer);
    clearTimeout(clickTimer);
    if (!ringOpen) {
      longTimer = setTimeout(() => {
        if (drag && !drag.moved) { suppressClick = true; doHold(); }
      }, 430);
    }
  });

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) > 5) {
      // Real drag: cancel long-press favorite and click even when pinned/ring-open,
      // so a pinned bud never fires favorite on a drag attempt.
      drag.moved = true;
      clearTimeout(longTimer);
      if (cfg.bud.pinned || ringOpen) {
        drag.blocked = true;
      } else {
        document.body.classList.add('dragging');
        budEl.classList.add('dragging');
      }
    }
    if (drag.moved && !drag.blocked) cmd('drag', { cx: e.screenX - drag.offX, cy: e.screenY - drag.offY });
  });

  window.addEventListener('pointerup', e => {
    if (e.button !== 0 || !drag) return;
    clearTimeout(longTimer);
    const d = drag; drag = null;
    if (d.moved) {
      document.body.classList.remove('dragging');
      budEl.classList.remove('dragging');
      if (!d.blocked) cmd('drag-end', { cx: e.screenX - d.offX, cy: e.screenY - d.offY });
      return; // blocked (pinned) drag ends silently
    }
    if (suppressClick) { suppressClick = false; return; }
    if (ringOpen) { cmd('pop'); return; }
    // A single tap while listening stops dictation, or while speaking stops read-aloud.
    if (voiceState === 'listening') { cmd('dictate-stop'); return; }
    if (voiceState === 'speaking') { cmd('speak-stop'); return; }
    if (Date.now() - lastWheel < 1600) { cmd('chip-run'); return; }
    // Delay the ring open only when a double-tap actually has an action to catch.
    const dbl = cfg.behavior.doubleClickAction;
    const hasDouble = dbl === 'dictate' || (dbl !== 'dictate' && cfg.favoriteId);
    if (hasDouble) {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => openWithPulse(), 200);
    } else openWithPulse();
  });

  function openWithPulse() {
    const p = budEl.querySelector('.pulse');
    p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
    cmd('open-ring');
  }

  budEl.addEventListener('dblclick', e => {
    e.preventDefault();
    if (ringOpen) return;
    clearTimeout(clickTimer);
    if (cfg.behavior.doubleClickAction === 'dictate') cmd('dictate-toggle');
    else if (cfg.favoriteId) cmd('favorite');
  });

  budEl.addEventListener('contextmenu', e => { e.preventDefault(); cmd('ctx'); });

  budEl.addEventListener('wheel', e => {
    if (ringOpen || cfg.behavior.scrollCycle === false) return;
    const pins = (cfg.pinnedIds || []).length;
    if (!pins) return;
    e.preventDefault();
    lastWheel = Date.now();
    cmd('wheel', { dir: e.deltaY > 0 ? 1 : -1 });
  }, { passive: false });

  // file drop → contextual mini-ring
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
    e.preventDefault();
    budEl.classList.add('dropready');
  }));
  document.addEventListener('dragleave', () => budEl.classList.remove('dropready'));
  document.addEventListener('drop', e => {
    e.preventDefault();
    budEl.classList.remove('dropready');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const p = window.bloom.filePath(f);
    if (p) cmd('drop', { path: p });
  });

  // If this window holds focus while the ring is open, forward nav keys to the overlay.
  const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Backspace', 'Home', 'Tab', '?', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  window.addEventListener('keydown', e => {
    if (!ringOpen || !NAV_KEYS.includes(e.key)) return;
    e.preventDefault();
    cmd('key', { key: e.key, shift: e.shiftKey });
  });

  // events
  window.bloom.on('config-changed', c => { cfg = c; applyAppearance(); });
  // main blanks the bud after the overlay paints; renderer timers throttle while occluded
  window.bloom.on('bud-conceal', on => document.body.classList.toggle('conceal', !!on));
  window.bloom.on('ui-flags', f => {
    ringOpen = !!f.ringOpen;
    document.body.classList.toggle('open', ringOpen);
  });
  // Voice state drives the orb morph: listening pulse, transcribing spinner, speaking glow.
  window.bloom.on('voice-ui', v => {
    voiceState = v.state || 'idle';
    budEl.classList.toggle('voice-on', voiceState !== 'idle');
    budEl.classList.toggle('voice-listening', voiceState === 'listening');
    budEl.classList.toggle('voice-transcribing', voiceState === 'transcribing');
    budEl.classList.toggle('voice-speaking', voiceState === 'speaking');
    budEl.style.setProperty('--vlevel', (v.level || 0).toFixed(3));
  });

  // boot
  applyAppearance();
  budEl.classList.add('breathe');
  makeTrayIcon();

  // test hook
  window.__bud = {
    cmd,
    state: () => ({ ringOpen, center: { x: window.screenX + innerWidth / 2, y: window.screenY + innerHeight / 2 } })
  };
})();
