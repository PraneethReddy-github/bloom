// Bloom onboarding window: a small first-run tour, cards swipe horizontally.
'use strict';
(async function () {
  const IC = window.BloomIcons;
  const $ = s => document.querySelector(s);

  let cfg = {};
  try { cfg = await window.bloom.getConfig(); } catch (_) {}
  // accent themes the interactive bits
  const ACC = (cfg.appearance && cfg.appearance.accentA) || '#007ACC';
  document.documentElement.style.setProperty('--acc', ACC);
  const hkKeys = ((cfg.hotkeys && cfg.hotkeys.toggleRing) || 'Control+Alt+Space')
    .replace(/Control/g, 'Ctrl').replace(/Super/g, 'Meta').split('+');

  // Card 1: the Bloom mark.
  const brandArt = IC.logo(120, { strokeWidth: 2.4 });

  // Card 2: the dial, a ring of wedges around the bud with one lit.
  function dialArt() {
    const cx = 74, cy = 74, rIn = 30, rOut = 60, n = 6, hot = 1;
    const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const sector = (a0, a1) => {
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const [x0o, y0o] = pt(rOut, a0), [x1o, y1o] = pt(rOut, a1);
      const [x1i, y1i] = pt(rIn, a1), [x0i, y0i] = pt(rIn, a0);
      return `M${x0o.toFixed(1)} ${y0o.toFixed(1)} A${rOut} ${rOut} 0 ${large} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)}`
        + ` L${x1i.toFixed(1)} ${y1i.toFixed(1)} A${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
    };
    let wedges = '';
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2;
      const on = i === hot;
      wedges += `<path d="${sector(a0 + 0.03, a1 - 0.03)}"
        fill="${on ? ACC : 'rgba(255,255,255,0.04)'}" fill-opacity="${on ? 0.3 : 1}"
        stroke="${on ? ACC : 'rgba(255,255,255,0.16)'}" stroke-width="${on ? 1.6 : 1}"/>`;
    }
    return `<svg width="148" height="148" viewBox="0 0 148 148" fill="none" aria-hidden="true">
      ${wedges}
      <circle cx="${cx}" cy="${cy}" r="16" fill="#12141c" stroke="rgba(255,255,255,0.22)" stroke-width="1.2"/>
      <circle cx="${cx}" cy="${cy}" r="4.5" fill="${ACC}"/>
    </svg>`;
  }

  // Card 3: the summon shortcut, shown as keycaps.
  const keysArt = `<div class="ob-keys">${hkKeys.map(k => `<div class="ob-key">${IC.escapeHTML(k)}</div>`).join('')}</div>`;

  const steps = [
    {
      art: brandArt,
      h: 'Meet Bloom',
      p: `Bloom is a launcher that lives as a small bud on your desktop. Tap it and the things you reach for most fan out around it — apps, sites, folders, notes.`
    },
    {
      art: dialArt(),
      h: 'One tap, and it opens',
      p: `Click the bud and your actions bloom into a ring. <b>Hover a folder</b> to open a deeper ring inside it, so a big setup still stays a flick away.`
    },
    {
      art: keysArt,
      h: 'Summon it from anywhere',
      p: `Press these keys to call the ring up over any app. <b>Drag the bud</b> wherever it feels right, or pin it in place.`
    },
    {
      art: brandArt,
      h: 'Make it yours',
      p: `<b>Right-click the bud</b> to open Settings. Add your own actions, pick a favorite, bind hotkeys, and shape how it looks. When you're done, the bud is waiting in the center of your screen.`
    }
  ];

  let i = 0;
  const slide = $('#slide'), artEl = $('#art'), hEl = $('#ob-h'), pEl = $('#ob-p');
  const dotsEl = $('#dots'), nextBtn = $('#ob-next'), skipBtn = $('#ob-skip');
  dotsEl.innerHTML = steps.map(() => '<i></i>').join('');
  const dots = Array.from(dotsEl.children);

  function render(dir) {
    const s = steps[i];
    artEl.innerHTML = s.art;
    hEl.textContent = s.h;
    pEl.innerHTML = s.p;
    dots.forEach((d, n) => d.classList.toggle('on', n === i));
    nextBtn.textContent = i === steps.length - 1 ? 'Start' : 'Next';
    skipBtn.style.visibility = i === steps.length - 1 ? 'hidden' : 'visible';
    slide.classList.remove('in-right', 'in-left');
    void slide.offsetWidth;
    slide.classList.add(dir === 'back' ? 'in-left' : 'in-right');
  }

  function go(delta) {
    const ni = i + delta;
    if (ni < 0) return;
    if (ni >= steps.length) { finish(); return; }
    i = ni; render(delta < 0 ? 'back' : 'fwd');
  }
  function finish() { try { window.bloom.onboardingDone(); } catch (_) {} }

  nextBtn.addEventListener('click', () => go(1));
  skipBtn.addEventListener('click', finish);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Escape') finish();
  });

  render('fwd');
})();
