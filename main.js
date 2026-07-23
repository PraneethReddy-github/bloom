// Bloom main process: an always-interactive bud window plus a fullscreen click-through overlay.
'use strict';
const { app, BrowserWindow, screen, ipcMain, globalShortcut, Tray, Menu, shell, clipboard, dialog, desktopCapturer, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const store = require('./config');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

app.setName('bloom');
if (IS_LINUX) app.commandLine.appendSwitch('enable-transparent-visuals');
app.setLoginItemSettings({ openAtLogin: true });

let budWin = null;
let overlay = null;
let settingsWin = null;
let onboardWin = null;
let tray = null;
let cfg = null;

// What the overlay currently needs from the OS.
const uiFlags = { ringOpen: false, uiActive: false, displayOnly: false };

// ---- bud window ----
// The window is the bud's hit region, so the bud never needs click-through management.
const BUD_PAD = 18;
const budWinSize = () => cfg.bud.size + BUD_PAD * 2;

function defaultBudCenter() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + Math.round(wa.width / 2), y: wa.y + Math.round(wa.height / 2) };
}

function budCenter() {
  if (!budWin) return defaultBudCenter();
  const b = budWin.getBounds();
  return { x: b.x + Math.round(b.width / 2), y: b.y + Math.round(b.height / 2) };
}

function clampCenterToDisplay(cx, cy) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(cy) });
  const m = cfg.bud.size / 2 + 4;
  return {
    x: Math.max(d.bounds.x + m, Math.min(d.bounds.x + d.bounds.width - m, cx)),
    y: Math.max(d.bounds.y + m, Math.min(d.bounds.y + d.bounds.height - m, cy))
  };
}

function placeBud(cx, cy) {
  const s = budWinSize();
  const c = clampCenterToDisplay(cx, cy);
  budWin.setBounds({ x: Math.round(c.x - s / 2), y: Math.round(c.y - s / 2), width: s, height: s });
  broadcastBudPos();
}

let persistTimer = null;
function persistBud() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const c = budCenter();
    cfg.bud.x = c.x; cfg.bud.y = c.y;
    store.save(cfg);
  }, 500);
}

// The overlay spans the union of every display, so ring coordinates are display-independent.
function unionBounds() {
  const ds = screen.getAllDisplays();
  const x1 = Math.min(...ds.map(d => d.bounds.x));
  const y1 = Math.min(...ds.map(d => d.bounds.y));
  const x2 = Math.max(...ds.map(d => d.bounds.x + d.bounds.width));
  const y2 = Math.max(...ds.map(d => d.bounds.y + d.bounds.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
let ovBounds = null;

function ensureOverlayBounds() {
  if (!overlay || overlay.isDestroyed()) return;
  const u = unionBounds();
  if (!ovBounds || u.x !== ovBounds.x || u.y !== ovBounds.y || u.width !== ovBounds.width || u.height !== ovBounds.height) {
    ovBounds = u;
    overlay.setBounds(u);
  }
}

function broadcastBudPos() {
  if (!overlay || overlay.isDestroyed() || !ovBounds) return;
  const c = budCenter();
  overlay.webContents.send('bud-pos', { x: c.x - ovBounds.x, y: c.y - ovBounds.y });
}

function createBudWin() {
  const s = budWinSize();
  const c = (cfg.bud.x != null && cfg.bud.y != null)
    ? clampCenterToDisplay(cfg.bud.x, cfg.bud.y) : defaultBudCenter();
  budWin = new BrowserWindow({
    x: Math.round(c.x - s / 2), y: Math.round(c.y - s / 2), width: s, height: s,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, skipTaskbar: true, hasShadow: false,
    type: 'toolbar',
    // focusable:false so clicking the bud never steals focus from the app the
    // user is typing in — that's what lets dictation paste land at their cursor
    // and read-aloud grab their real selection. The overlay owns ring keyboard nav.
    alwaysOnTop: true, focusable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  budWin.setAlwaysOnTop(true, 'screen-saver');
  budWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  budWin.setMenuBarVisibility(false);
  budWin.loadFile('renderer/bud.html');
  // Stay hidden behind the onboarding cards until they're done.
  budWin.once('ready-to-show', () => { if (!cfg.bud.hidden && cfg.seenOnboarding) revealBud(); });
  budWin.on('closed', () => { budWin = null; });
}

// ---- onboarding window ----
function createOnboardWin() {
  if (onboardWin && !onboardWin.isDestroyed()) { onboardWin.show(); onboardWin.focus(); return; }
  onboardWin = new BrowserWindow({
    width: 620, height: 600, center: true, resizable: false, frame: false,
    backgroundColor: '#000000', skipTaskbar: false, title: 'Welcome to Bloom',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  onboardWin.setMenuBarVisibility(false);
  onboardWin.loadFile('renderer/onboard.html');
  onboardWin.once('ready-to-show', () => { onboardWin.show(); onboardWin.focus(); updateDock(); });
  onboardWin.on('closed', () => {
    onboardWin = null;
    updateDock();
    // Dismissed without finishing — still hand off so the bud isn't stranded off-screen.
    if (!cfg.seenOnboarding) finishOnboarding();
  });
}

function finishOnboarding() {
  cfg.seenOnboarding = true;
  store.save(cfg);
  broadcast('config-changed', cfg);
  if (onboardWin && !onboardWin.isDestroyed()) onboardWin.close();
  if (cfg.bud.x == null || cfg.bud.y == null) { const c = defaultBudCenter(); placeBud(c.x, c.y); }
  if (!cfg.bud.hidden) revealBud();
}

// Conceal via click-through + CSS opacity, never by unmapping (setOpacity is a Linux no-op).
function concealBud() {
  budWin?.setIgnoreMouseEvents(true);
  budWin?.webContents.send('bud-conceal', true);
}
function revealBud() {
  if (!budWin) return;
  budWin.setIgnoreMouseEvents(false);
  budWin.webContents.send('bud-conceal', false);
  if (!budWin.isVisible()) { budWin.showInactive(); budWin.setSkipTaskbar(true); }
}

// ---- overlay ----
function createOverlay() {
  ovBounds = unionBounds();
  overlay = new BrowserWindow({
    ...ovBounds,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, skipTaskbar: true, hasShadow: false,
    type: 'toolbar',
    alwaysOnTop: true, focusable: true, show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setMenuBarVisibility(false);
  overlay.setIgnoreMouseEvents(true);
  const q = new URLSearchParams();
  if (process.env.BLOOM_WALLPAPER) q.set('wallpaper', process.env.BLOOM_WALLPAPER);
  overlay.loadFile('renderer/index.html', { query: Object.fromEntries(q) });
  // Stay mapped forever to avoid WM map/unmap animations; re-assert setSkipTaskbar since Linux drops the hint on map.
  overlay.once('ready-to-show', () => { overlay.showInactive(); overlay.setSkipTaskbar(true); });
  if (process.env.BLOOM_DEVTOOLS) overlay.webContents.openDevTools({ mode: 'detach' });
  overlay.on('closed', () => { overlay = null; app.quit(); });

  // Keep the union in sync when monitors are added/removed/rearranged.
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, () => { ovBounds = null; ensureOverlayBounds(); broadcastBudPos(); });
  }
}

// Single authority for overlay visibility/interactivity: a pure function of uiFlags.
function applyOverlayState() {
  if (!overlay || overlay.isDestroyed()) return;
  budWin?.webContents.send('ui-flags', { ringOpen: uiFlags.ringOpen });
  const { ringOpen, uiActive, displayOnly } = uiFlags;
  if (ringOpen || uiActive) {
    ensureOverlayBounds();
    broadcastBudPos();
    if (!overlay.isVisible()) overlay.showInactive();
    overlay.setIgnoreMouseEvents(false);
    overlay.focus();
  } else if (displayOnly) {     // toasts / scroll-chip: visible but click-through
    ensureOverlayBounds();
    broadcastBudPos();
    if (!overlay.isVisible()) overlay.showInactive();
    overlay.setIgnoreMouseEvents(true);
    budWin?.moveTop();
  } else {
    // Idle: stay mapped, go click-through, hand focus back to the user.
    overlay.setIgnoreMouseEvents(true);
    if (overlay.isFocused()) overlay.blur();
  }
}

// Bloom lives as a floating bud + tray app: no dock/taskbar presence normally.
// The macOS dock icon (one per app) only appears while a real window — Settings
// or onboarding — is open, and it shows the Bloom mark, not a stray default icon.
// (bud/overlay/voice windows already skipTaskbar, so Windows/Linux need nothing more.)
function updateDock() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const anyReal = [settingsWin, onboardWin].some(w => w && !w.isDestroyed() && w.isVisible());
  if (anyReal) {
    if (lastTrayIcon) { try { app.dock.setIcon(nativeImage.createFromDataURL(lastTrayIcon)); } catch { /* icon optional */ } }
    app.dock.show();
  } else {
    app.dock.hide();
  }
}

function createSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show(); settingsWin.focus();
    updateDock();
    if (tab) settingsWin.webContents.send('settings-tab', tab);
    return;
  }
  const saved = cfg.settingsBounds;
  settingsWin = new BrowserWindow({
    width: saved?.width || 1000, height: saved?.height || 720,
    x: saved?.x, y: saved?.y,
    minWidth: 820, minHeight: 560,
    backgroundColor: '#0b0b0c',
    frame: false,               // custom titlebar and window controls
    alwaysOnTop: false,         // normal window so the OS dock stays above it
    autoHideMenuBar: true,
    title: 'Bloom Settings',
    icon: lastTrayIcon ? nativeImage.createFromDataURL(lastTrayIcon) : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile('renderer/settings.html');
  if (lastTrayIcon) { try { settingsWin.setIcon(nativeImage.createFromDataURL(lastTrayIcon)); } catch {} }
  settingsWin.webContents.once('did-finish-load', () => {
    if (tab) settingsWin.webContents.send('settings-tab', tab);
  });
  settingsWin.once('ready-to-show', updateDock);
  settingsWin.on('close', () => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    cfg.settingsBounds = settingsWin.getBounds();
    store.save(cfg);
  });
  settingsWin.on('closed', () => { settingsWin = null; updateDock(); });
}

function broadcast(channel, data) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}

// ---- tray ----
function createTray(dataURL) {
  const img = nativeImage.createFromDataURL(dataURL).resize({ width: 22, height: 22 });
  if (!tray) tray = new Tray(img); else tray.setImage(img);
  tray.setToolTip('Bloom — your desktop, one bloom away');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Ring', click: () => summonRing() },
    { label: 'Command Palette', click: () => summonPalette() },
    { type: 'separator' },
    { label: 'Edit Actions', click: () => createSettings('actions') },
    { label: 'Settings', click: () => createSettings() },
    { type: 'separator' },
    { label: 'Quit Bloom', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => summonRing());
}

let lastTrayIcon = null;
function blankIcon() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
}

// ---- summoning ----
let ghostRestore = null; // bud center to restore after a ghost summon

function summonRing() {
  if (!overlay) return;
  if (!cfg.seenOnboarding) { createOnboardWin(); return; }
  if (uiFlags.ringOpen) { overlay.webContents.send('close-ring'); return; }
  if (cfg.bud.hidden) {
    // Ghost: anchor the ring at the cursor; the overlay draws the bud there.
    ghostRestore = budCenter();
    const pt = screen.getCursorScreenPoint();
    placeBud(pt.x, pt.y);
  }
  uiFlags.ringOpen = true;      // optimistic, so the window is visible for the bloom animation
  applyOverlayState();
  const c = budCenter();
  overlay.webContents.send('summon-ring', { budLocal: { x: c.x - ovBounds.x, y: c.y - ovBounds.y } });
}

// Work area of the bud's display in overlay-local coords, so the palette centers on that screen.
function budDisplayRectLocal() {
  const c = budCenter();
  const d = screen.getDisplayNearestPoint({ x: Math.round(c.x), y: Math.round(c.y) });
  const wa = d.workArea;
  return { x: wa.x - ovBounds.x, y: wa.y - ovBounds.y, width: wa.width, height: wa.height };
}

function summonPalette() {
  if (!overlay) return;
  uiFlags.uiActive = true;
  applyOverlayState();
  overlay.webContents.send('summon-palette', { rect: budDisplayRectLocal() });
}

function endGhost() {
  if (ghostRestore && cfg.bud.hidden) {
    placeBud(ghostRestore.x, ghostRestore.y);
    budWin?.hide();
  }
  ghostRestore = null;
}

// ---- voice: dictation (STT) + read-aloud (TTS) ----
// A hidden window owns the mic + Web Speech synthesis; the main process owns
// the Whisper model (transformers.js), text injection, and selection capture.
let voiceWin = null;
let voiceState = 'idle';          // idle | listening | transcribing | speaking
let whisper = null;               // lazy transformers.js pipeline
let whisperLoading = null;

function createVoiceWin() {
  voiceWin = new BrowserWindow({
    width: 260, height: 120, show: false, frame: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  voiceWin.loadFile('renderer/voice.html');
  voiceWin.on('closed', () => { voiceWin = null; });
}

function setVoiceState(s, level = 0) {
  voiceState = s;
  budWin?.webContents.send('voice-ui', { state: s, level });
}

// A small overlay toast, reusing the exec-feedback channel.
function voiceToast(note, ok = true) {
  if (!overlay) return;
  uiFlags.displayOnly = true; applyOverlayState();
  overlay.webContents.send('exec-feedback', { nodeId: null, label: 'Voice', ok, note });
}

// Which OS tool can synthesize a Ctrl/Cmd chord into the focused app.
// Linux splits X11 (xdotool) vs Wayland (wtype/ydotool).
function inputTool() {
  if (IS_WIN) return 'powershell';
  if (!IS_LINUX) return 'osascript';                 // macOS
  const wayland = !!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland';
  if (wayland) return hasBin('wtype') ? 'wtype' : (hasBin('ydotool') ? 'ydotool' : null);
  return hasBin('xdotool') ? 'xdotool' : null;
}

const MISSING_TOOL_MSG = IS_LINUX
  ? 'Copied — press Ctrl+V (install xdotool on X11, or wtype on Wayland, to auto-paste)'
  : 'Copied — press Ctrl+V to paste';

// Synthesize Ctrl/Cmd + key ('v' paste, 'c' copy) into whatever app holds focus.
// ponytail: OS keystroke sim is the only portable "get selection / paste" path.
async function sendChord(key) {
  const t = inputTool();
  await sleep(120);
  switch (t) {
    case 'powershell': return run(`powershell -c "$w=New-Object -ComObject WScript.Shell; $w.SendKeys('^${key}')"`);
    case 'osascript': return run(`osascript -e 'tell application "System Events" to keystroke "${key}" using command down'`);
    case 'xdotool': return run(`xdotool key --clearmodifiers ctrl+${key}`);
    case 'wtype': return run(`wtype -M ctrl -k ${key} -m ctrl`);
    case 'ydotool': { const c = key === 'v' ? 47 : 46; return run(`ydotool key 29:1 ${c}:1 ${c}:0 29:0`); }
    default: return { ok: false, error: MISSING_TOOL_MSG };
  }
}

// Copy the focused app's selection and read it off the clipboard, restoring the
// user's clipboard afterward. Returns the text, '' if nothing was selected, or
// null if no input tool is available.
async function grabSelection() {
  const prev = clipboard.readText();
  clipboard.writeText('');                           // clear so an empty selection is detectable
  const r = await sendChord('c');
  await sleep(160);
  const sel = clipboard.readText();
  clipboard.writeText(prev);                         // restore the user's clipboard
  return r.ok ? sel.trim() : null;
}

function execFavorite(id, label) {
  const fav = id && store.findNode(cfg.root, id);
  if (fav) return execute(fav);
  voiceToast(`No ${label} set — pick one in Edit Actions`, true);
}

function toggleDictation() {
  if (!voiceWin) return;
  if (voiceState === 'listening') { stopDictation(); return; }
  if (voiceState !== 'idle') return;            // busy transcribing/speaking
  setVoiceState('listening');
  voiceWin.webContents.send('voice-cmd', { action: 'start' });
}

function stopDictation() {
  if (voiceState !== 'listening') return;
  setVoiceState('transcribing');
  voiceWin?.webContents.send('voice-cmd', { action: 'stop' });
}

// Paste the transcript at the user's cursor. The bud is non-focusable, so their
// app kept focus — the clipboard+paste lands where they were typing. If no paste
// tool is available the text stays on the clipboard for a manual Ctrl+V.
async function injectText(text) {
  text = (text || '').trim();
  setVoiceState('idle');
  if (!text) { voiceToast('No speech detected'); return; }
  clipboard.writeText(text);                        // always leave the transcript on the clipboard
  const r = await sendChord('v');
  voiceToast(r.ok ? 'Pasted — also copied to clipboard' : (r.error || MISSING_TOOL_MSG), r.ok);
}

// OS-level text-to-speech. Chromium's speechSynthesis has no voices on Linux
// without speech-dispatcher, so we speak via the OS engine everywhere for
// reliability: spd-say/espeak (Linux), say (macOS), System.Speech (Windows).
let ttsChild = null;
function stopOsSpeak() {
  if (!ttsChild) return;
  try { ttsChild.kill(); } catch { /* already gone */ }
  ttsChild = null;
  // spd-say is only a client — the speechd daemon keeps talking after the kill
  // unless we cancel explicitly. Other engines (say/espeak/SAPI) die with the child.
  if (IS_LINUX && hasBin('spd-say')) { try { cp.spawn('spd-say', ['-C'], { stdio: 'ignore' }); } catch { /* best effort */ } }
}
function osSpeak(text, rate, voice) {
  return new Promise((resolve) => {
    stopOsSpeak();
    const clean = String(text).replace(/[\r\n]+/g, ' ').slice(0, 4000);
    let cmd, args, useStdin = false;
    if (IS_WIN) {
      const r = Math.max(-10, Math.min(10, Math.round((rate - 1) * 5)));
      const pick = voice ? `$s.SelectVoice('${String(voice).replace(/'/g, "''")}');` : '';
      cmd = 'powershell';
      args = ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${pick} $s.Rate=${r}; $s.Speak([Console]::In.ReadToEnd())`];
      useStdin = true;                                          // pass text via stdin (avoids escaping)
    } else if (!IS_LINUX) {                                     // macOS
      cmd = 'say'; args = ['-r', String(Math.round(175 * rate))];
      if (voice) args.push('-v', voice);
      args.push(clean);
    } else if (hasBin('spd-say')) {
      const r = Math.max(-100, Math.min(100, Math.round((rate - 1) * 100)));
      cmd = 'spd-say'; args = ['-w', '-r', String(r)];
      if (voice) args.push('-t', voice);                        // speech-dispatcher voice type
      args.push(clean);                                         // spawn passes text safely (no shell)
    } else {
      const bin = firstBin(['espeak-ng', 'espeak']);
      if (!bin) return resolve({ ok: false, error: 'No TTS engine — install speech-dispatcher or espeak-ng' });
      cmd = bin; args = ['-s', String(Math.round(175 * rate)), clean];
    }
    // Backstop: if the engine hangs (e.g. a broken audio sink), never leave the
    // orb stuck "speaking" — kill and resolve after a generous, length-based cap.
    const capMs = Math.min(120000, Math.max(8000, clean.length * 90));
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); ttsChild = null; resolve(r); };
    const timer = setTimeout(() => { stopOsSpeak(); finish({ ok: true }); }, capMs);
    try {
      ttsChild = cp.spawn(cmd, args, { stdio: [useStdin ? 'pipe' : 'ignore', 'ignore', 'ignore'] });
      ttsChild.on('error', (e) => finish({ ok: false, error: e.message }));
      ttsChild.on('exit', () => finish({ ok: true }));
      if (useStdin) { ttsChild.stdin.write(clean); ttsChild.stdin.end(); }
    } catch (e) { finish({ ok: false, error: e.message }); }
  });
}

// Read the current selection aloud. Shows the "reading" indicator the instant it
// is triggered (before grabbing the selection or starting speech), so there's no
// silent wait. The bud is non-focusable, so the selection in the user's app is intact.
async function speakSelection() {
  if (voiceState === 'speaking') { stopOsSpeak(); setVoiceState('idle'); return; }   // hold again to stop
  if (voiceState !== 'idle') return;
  setVoiceState('speaking');                       // instant orb feedback
  voiceToast('Reading selection…');                // instant toast
  const sel = await grabSelection();
  if (sel === null) { setVoiceState('idle'); voiceToast(IS_LINUX ? 'Install xdotool (X11) or wtype (Wayland) to read selections' : 'Read-aloud unavailable', false); return; }
  if (!sel) { setVoiceState('idle'); voiceToast('Select some text first, then hold the bud', false); return; }
  const r = await osSpeak(sel, cfg.voice.ttsRate || 1, cfg.voice.ttsVoice);
  setVoiceState('idle');
  if (!r.ok) voiceToast(r.error || 'Read-aloud failed', false);
}

function stopSpeaking() {
  if (voiceState !== 'speaking') return;
  stopOsSpeak();
  setVoiceState('idle');
}

// Enumerate the OS TTS voices so Settings can offer a picker.
async function listVoices() {
  if (IS_WIN) {
    const r = await new Promise(res => cp.exec(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | %{ $_.VoiceInfo.Name }"`, (e, out) => res(e ? '' : out)));
    return r.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(n => ({ id: n, label: n }));
  }
  if (!IS_LINUX) {                                             // macOS: `say -v '?'` → "Name  lang  # sample"
    const r = await new Promise(res => cp.exec(`say -v '?'`, (e, out) => res(e ? '' : out)));
    return r.split('\n').map(line => {
      const m = line.match(/^(.+?)\s{2,}([a-z]{2}[_-][A-Z]{2})/);
      return m ? { id: m[1].trim(), label: `${m[1].trim()} (${m[2]})` } : null;
    }).filter(Boolean);
  }
  // Linux/speech-dispatcher: the 8 standard voice types work across output modules.
  if (hasBin('spd-say')) return [
    { id: 'male1', label: 'Male 1' }, { id: 'male2', label: 'Male 2' }, { id: 'male3', label: 'Male 3' },
    { id: 'female1', label: 'Female 1' }, { id: 'female2', label: 'Female 2' }, { id: 'female3', label: 'Female 3' },
    { id: 'child_male', label: 'Child (male)' }, { id: 'child_female', label: 'Child (female)' }
  ];
  return [];
}

// Lazy-load the Whisper pipeline (downloads the model on first use, then cached).
async function getWhisper() {
  if (whisper) return whisper;
  if (whisperLoading) return whisperLoading;
  whisperLoading = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = path.join(store.DIR, 'models');   // persist model next to config
    env.allowLocalModels = false;
    whisper = await pipeline('automatic-speech-recognition', cfg.voice.model || 'Xenova/whisper-base.en');
    return whisper;
  })();
  return whisperLoading;
}

// ---- auto-update (electron-updater; GitHub releases via the build's publish config) ----
// Modeled on ternix: lazy-require so a build without the optional dep degrades to
// "up to date", autoDownload off (download is an explicit user action), and every
// updater event is forwarded to the renderer on one 'update-status' channel.
let autoUpdater = null;
function getUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    const push = (event, info) => broadcast('update-status', { event, info });
    autoUpdater.on('checking-for-update', () => push('checking'));
    autoUpdater.on('update-available', (info) => { push('available', { version: info?.version, notes: info?.releaseNotes }); voiceToast(`Bloom ${info?.version || ''} available — open Settings › About to update`); });
    autoUpdater.on('update-not-available', () => push('none'));
    autoUpdater.on('error', (err) => push('error', { message: String(err?.message || err) }));
    autoUpdater.on('download-progress', (p) => push('progress', { percent: p?.percent, bytesPerSecond: p?.bytesPerSecond }));
    autoUpdater.on('update-downloaded', (info) => push('downloaded', { version: info?.version }));
  } catch { return null; }        // optional dep absent (e.g. unpackaged run)
  return autoUpdater;
}
function applyUpdateChannel(up) {
  up.allowPrerelease = (cfg.updates?.channel || 'stable') === 'beta';
}
async function checkForUpdates(silent) {
  const up = getUpdater();
  if (!up) { if (!silent) broadcast('update-status', { event: 'error', info: { message: 'Updater unavailable (run a packaged build)' } }); return; }
  applyUpdateChannel(up);
  try { await up.checkForUpdates(); }
  catch (e) { if (!silent) broadcast('update-status', { event: 'error', info: { message: String(e?.message || e) } }); }
}

// ---- shortcuts ----
function registerShortcuts() {
  globalShortcut.unregisterAll();
  const tryReg = (accel, fn) => {
    if (!accel) return;
    try { globalShortcut.register(accel, fn); } catch { /* invalid accelerator */ }
  };
  tryReg(cfg.hotkeys.toggleRing, () => summonRing());
  tryReg(cfg.hotkeys.palette, () => summonPalette());
  if (cfg.hotkeys.dictate) tryReg(cfg.hotkeys.dictate, () => toggleDictation());
  if (cfg.hotkeys.speak) tryReg(cfg.hotkeys.speak, () => speakSelection());
  for (const [nodeId, accel] of Object.entries(cfg.quickfire || {})) {
    tryReg(accel, () => {
      const node = store.findNode(cfg.root, nodeId);
      if (node) execute(node);
    });
  }
}

// ---- shell helpers ----
const binCache = new Map();
function hasBin(name) {
  if (binCache.has(name)) return binCache.get(name);
  let ok = false;
  try {
    const r = cp.spawnSync(IS_WIN ? 'where' : 'which', [name], { timeout: 3000 });
    ok = r.status === 0;
  } catch { ok = false; }
  binCache.set(name, ok);
  return ok;
}
function firstBin(list) { return list.find(hasBin) || null; }
function expandHome(p) {
  if (!p) return p;
  return p.replace(/^~(?=$|\/|\\)/, os.homedir());
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function launch(cmd, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = cp.spawn(cmd, { shell: true, detached: !IS_WIN, stdio: 'ignore', ...opts });
    } catch (e) { return resolve({ ok: false, error: e.message }); }
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    child.once('error', (e) => done({ ok: false, error: e.message }));
    child.once('exit', (code) => {
      if (code === 127) done({ ok: false, error: 'command not found' });
      else if (code !== 0) done({ ok: false, error: `exited with code ${code}` });
      else done({ ok: true });
    });
    setTimeout(() => { try { child.unref(); } catch { } done({ ok: true }); }, 1600);
  });
}

function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    cp.exec(cmd, { timeout: opts.timeout || 120000, ...opts }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, error: (stderr || err.message || '').trim().slice(-300) || 'failed' });
      else resolve({ ok: true });
    });
  });
}

async function confirmDialog(title, detail) {
  const win = settingsWin && settingsWin.isFocused() ? settingsWin : (overlay?.isVisible() ? overlay : null);
  const opts = {
    type: 'warning',
    buttons: ['Cancel', 'Continue'],
    defaultId: 0, cancelId: 0,
    title: 'Bloom', message: title, detail, noLink: true
  };
  const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return r.response === 1;
}

// ---- browsers ----
const BROWSERS = {
  chrome: { linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'], win: 'start "" chrome', profile: (p) => `--profile-directory="${p}"`, newWin: '--new-window' },
  chromium: { linux: ['chromium', 'chromium-browser'], win: 'start "" chromium', profile: (p) => `--profile-directory="${p}"`, newWin: '--new-window' },
  edge: { linux: ['microsoft-edge', 'microsoft-edge-stable'], win: 'start "" msedge', profile: (p) => `--profile-directory="${p}"`, newWin: '--new-window' },
  brave: { linux: ['brave-browser', 'brave'], win: 'start "" brave', profile: (p) => `--profile-directory="${p}"`, newWin: '--new-window' },
  firefox: { linux: ['firefox'], win: 'start "" firefox', profile: (p) => `-P "${p}"`, newWin: '--new-window' }
};

async function openUrls(params) {
  const urls = (params.urls || []).filter(Boolean);
  if (!urls.length) return { ok: false, error: 'no URLs configured' };
  const which = params.browser || 'default';
  if (which === 'default') {
    for (const u of urls) await shell.openExternal(u);
    return { ok: true };
  }
  const b = BROWSERS[which];
  if (!b) return { ok: false, error: `unknown browser "${which}"` };
  const args = [];
  if (params.profile) args.push(b.profile(params.profile));
  if (params.newWindow) args.push(b.newWin);
  const quoted = urls.map(u => `"${u}"`).join(' ');
  if (IS_WIN) return launch(`${b.win} ${args.join(' ')} ${quoted}`);
  const bin = firstBin(b.linux);
  if (!bin) return { ok: false, error: `${which} is not installed` };
  return launch(`${bin} ${args.join(' ')} ${quoted}`);
}

// ---- terminal ----
const LINUX_TERMS =['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'alacritty', 'kitty', 'xterm'];

async function openTerminal(params) {
  const cwd = expandHome(params.cwd || '~') || os.homedir();
  let cmd = (params.command || '').trim();
  if (params.admin) {
    const yes = await confirmDialog('Run elevated?', `This terminal command will run with sudo:\n${cmd || '(interactive shell)'}`);
    if (!yes) return { ok: false, error: 'cancelled' };
    if (cmd) cmd = `sudo ${cmd}`;
  }
  if (IS_WIN) {
    const inner = cmd ? ` powershell -NoExit -Command "${cmd.replace(/"/g, '\\"')}"` : '';
    if (hasBin('wt')) return launch(`wt -d "${cwd}"${inner}`);
    return launch(`start cmd /K "cd /d "${cwd}"${cmd ? ` && ${cmd}` : ''}"`);
  }
  const want = params.terminal && params.terminal !== 'default' ? params.terminal : (process.env.TERMINAL || null);
  const term = (want && hasBin(want)) ? want : firstBin(LINUX_TERMS);
  if (!term) return { ok: false, error: 'no terminal emulator found' };
  const shellCmd = cmd ? `bash -lc '${cmd.replace(/'/g, `'\\''`)}; exec bash'` : null;
  switch (path.basename(term)) {
    case 'gnome-terminal': return launch(`gnome-terminal --working-directory="${cwd}"${shellCmd ? ` -- ${shellCmd}` : ''}`);
    case 'konsole': return launch(`konsole --workdir "${cwd}"${shellCmd ? ` -e ${shellCmd}` : ''}`);
    case 'xfce4-terminal': return launch(`xfce4-terminal --working-directory="${cwd}"${shellCmd ? ` -x ${shellCmd}` : ''}`);
    default: return launch(`${term}${shellCmd ? ` -e ${shellCmd}` : ''}`, { cwd });
  }
}

// ---- system toggles ----
async function gsettingsFlip(schema, key, a, b) {
  const r = await new Promise(res => cp.exec(`gsettings get ${schema} ${key}`, (e, out) => res(e ? null : out.trim())));
  if (r === null) return { ok: false, error: 'gsettings unavailable' };
  const next = r.includes(a) ? b : a;
  return run(`gsettings set ${schema} ${key} ${next}`);
}

async function systemToggle(params) {
  const t = params.toggle;
  const destructive = ['sleep', 'restart', 'shutdown'];
  if (destructive.includes(t) || params.confirm) {
    const yes = await confirmDialog(`${t[0].toUpperCase() + t.slice(1)}?`, `Bloom is about to run "${t}".`);
    if (!yes) return { ok: false, error: 'cancelled' };
  }
  const L = !IS_WIN;
  switch (t) {
    case 'screenshot': {
      if (IS_WIN) return launch('explorer ms-screenclip:');
      const tool = firstBin(['gnome-screenshot', 'spectacle', 'flameshot']);
      if (tool === 'gnome-screenshot') return launch('gnome-screenshot -i');
      if (tool === 'spectacle') return launch('spectacle');
      if (tool === 'flameshot') return launch('flameshot gui');
      const dest = path.join(os.homedir(), 'Pictures');
      fs.mkdirSync(dest, { recursive: true });
      const file = path.join(dest, `bloom-${Date.now()}.png`);
      const r = await run(`import -window root "${file}"`);
      return r.ok ? { ok: true, note: `Saved ${file}` } : r;
    }
    case 'lock':
      if (IS_WIN) return run('rundll32.exe user32.dll,LockWorkStation');
      if (hasBin('loginctl')) return run('loginctl lock-session');
      return run('xdg-screensaver lock');
    case 'dark_theme':
      if (IS_WIN) return run(`powershell -c "$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; $v=(Get-ItemProperty -Path $k -Name AppsUseLightTheme).AppsUseLightTheme; $n=1-$v; Set-ItemProperty -Path $k -Name AppsUseLightTheme -Value $n; Set-ItemProperty -Path $k -Name SystemUsesLightTheme -Value $n"`);
      return gsettingsFlip('org.gnome.desktop.interface', 'color-scheme', "'prefer-dark'", "'default'");
    case 'night_light':
      if (IS_WIN) return launch('start ms-settings:nightlight');
      return gsettingsFlip('org.gnome.settings-daemon.plugins.color', 'night-light-enabled', 'true', 'false');
    case 'mute':
      if (IS_WIN) return mediaKeyWin(173);
      if (hasBin('pactl')) return run('pactl set-sink-mute @DEFAULT_SINK@ toggle');
      return run('amixer -q set Master toggle');
    case 'volume_up':
      if (IS_WIN) return mediaKeyWin(175);
      if (hasBin('pactl')) return run('pactl set-sink-volume @DEFAULT_SINK@ +5%');
      return run('amixer -q set Master 5%+');
    case 'volume_down':
      if (IS_WIN) return mediaKeyWin(174);
      if (hasBin('pactl')) return run('pactl set-sink-volume @DEFAULT_SINK@ -5%');
      return run('amixer -q set Master 5%-');
    case 'wifi_on': return L ? run('nmcli radio wifi on') : run('netsh interface set interface "Wi-Fi" enabled');
    case 'wifi_off': return L ? run('nmcli radio wifi off') : run('netsh interface set interface "Wi-Fi" disabled');
    case 'bt_on': return L ? run('bluetoothctl power on') : launch('start ms-settings:bluetooth');
    case 'bt_off': return L ? run('bluetoothctl power off') : launch('start ms-settings:bluetooth');
    case 'dnd_on': return L ? run('gsettings set org.gnome.desktop.notifications show-banners false') : launch('start ms-settings:quiethours');
    case 'dnd_off': return L ? run('gsettings set org.gnome.desktop.notifications show-banners true') : launch('start ms-settings:quiethours');
    case 'show_desktop':
      if (IS_WIN) return run(`powershell -c "(New-Object -ComObject Shell.Application).MinimizeAll()"`);
      if (hasBin('wmctrl')) return run('wmctrl -k on');
      if (hasBin('xdotool')) return run('xdotool key super+d');
      return { ok: false, error: 'needs wmctrl or xdotool' };
    case 'sleep': return IS_WIN ? run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0') : run('systemctl suspend');
    case 'restart': return IS_WIN ? run('shutdown /r /t 0') : run('systemctl reboot');
    case 'shutdown': return IS_WIN ? run('shutdown /s /t 0') : run('systemctl poweroff');
    default: return { ok: false, error: `unknown toggle "${t}"` };
  }
}

// ponytail: SendKeys media chars is the classic no-dependency Windows trick;
// swap for a tiny native helper if it proves flaky.
function mediaKeyWin(code) {
  return run(`powershell -c "$w=New-Object -ComObject WScript.Shell; $w.SendKeys([char]${code})"`);
}

async function mediaKey(params) {
  const k = params.key;
  if (IS_WIN) {
    const codes = { playpause: 179, next: 176, prev: 177, volup: 175, voldown: 174, mute: 173 };
    return codes[k] ? mediaKeyWin(codes[k]) : { ok: false, error: `unknown key "${k}"` };
  }
  if (['volup', 'voldown', 'mute'].includes(k)) {
    return systemToggle({ toggle: k === 'volup' ? 'volume_up' : k === 'voldown' ? 'volume_down' : 'mute' });
  }
  if (!hasBin('playerctl')) return { ok: false, error: 'playerctl not installed' };
  const map = { playpause: 'play-pause', next: 'next', prev: 'previous' };
  return run(`playerctl ${map[k] || k}`);
}

// ---- executor ----
async function execute(node) {
  if (typeof node === 'string') node = store.findNode(cfg.root, node);
  if (!node) return { ok: false, error: 'action not found' };
  if (node.enabled === false) return { ok: false, error: 'action is disabled' };
  const p = node.params || {};
  let result;
  try {
    switch (node.type) {
      case 'launch_app': {
        if (p.focusIfRunning && IS_LINUX && hasBin('wmctrl') && node.label) {
          const r = await run(`wmctrl -a "${node.label}"`);
          if (r.ok) { result = { ok: true }; break; }
        }
        result = await launch(p.command);
        break;
      }
      case 'open_url': result = await openUrls(p); break;
      case 'terminal': result = await openTerminal(p); break;
      case 'system_toggle': result = await systemToggle(p); break;
      case 'media': result = await mediaKey(p); break;
      case 'snippet': {
        clipboard.writeText(p.text || '');
        if (p.mode === 'paste') {
          if (IS_WIN) { await sleep(120); await run(`powershell -c "$w=New-Object -ComObject WScript.Shell; $w.SendKeys('^v')"`); }
          else if (hasBin('xdotool')) { await sleep(120); await run('xdotool key --clearmodifiers ctrl+v'); }
        }
        result = { ok: true, note: p.mode === 'paste' ? 'Pasted' : 'Copied to clipboard' };
        break;
      }
      case 'open_path': {
        const err = await shell.openPath(expandHome(p.path || ''));
        result = err ? { ok: false, error: err } : { ok: true };
        break;
      }
      case 'script': {
        const file = expandHome(p.file || '');
        if (!fs.existsSync(file)) { result = { ok: false, error: `script not found: ${file}` }; break; }
        const ext = path.extname(file).toLowerCase();
        const runner = ext === '.py' ? (IS_WIN ? 'python' : 'python3')
          : ext === '.ps1' ? 'powershell -ExecutionPolicy Bypass -File'
            : ext === '.bat' || ext === '.cmd' ? 'cmd /c'
              : 'bash';
        result = await run(`${runner} "${file}" ${p.args || ''}`);
        break;
      }
      case 'webhook': {
        if (!p.url) { result = { ok: false, error: 'no URL set' }; break; }
        try {
          const res = await fetch(p.url, {
            method: p.method || 'GET',
            body: p.method === 'POST' ? (p.body || '') : undefined,
            signal: AbortSignal.timeout(10000)
          });
          result = res.ok ? { ok: true, note: `HTTP ${res.status}` } : { ok: false, error: `HTTP ${res.status}` };
        } catch (e) { result = { ok: false, error: e.cause?.code || e.message }; }
        break;
      }
      case 'macro': {
        const steps = p.steps || [];
        result = { ok: true };
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (s.action === 'wait') { await sleep(Math.min(s.ms || 0, 30000)); continue; }
          const r = await execute({ id: `${node.id}#${i}`, type: s.action, label: `${node.label} · step ${i + 1}`, params: s, enabled: true });
          if (!r.ok) { result = { ok: false, error: `step ${i + 1} (${s.action}): ${r.error}` }; break; }
        }
        break;
      }
      case 'bloom': {
        if (p.cmd === 'settings') { createSettings(); result = { ok: true }; }
        else if (p.cmd === 'palette') { summonPalette(); result = { ok: true }; }
        else result = { ok: false, error: `unknown bloom command "${p.cmd}"` };
        break;
      }
      case 'folder': result = { ok: false, error: 'folders open rings, they do not execute' }; break;
      default: result = { ok: false, error: `unknown action type "${node.type}"` };
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  broadcast('exec-feedback', { nodeId: node.id, label: node.label, ok: result.ok, error: result.error, note: result.note });
  return result;
}

// ---- app list ----
async function listApps() {
  const apps = [];
  if (IS_LINUX) {
    const dirs = ['/usr/share/applications', '/usr/local/share/applications', path.join(os.homedir(), '.local/share/applications')];
    for (const dir of dirs) {
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop')); } catch { continue; }
      for (const f of files) {
        try {
          const txt = fs.readFileSync(path.join(dir, f), 'utf8');
          if (/^NoDisplay=true/m.test(txt)) continue;
          const name = txt.match(/^Name=(.+)$/m)?.[1];
          let exec = txt.match(/^Exec=(.+)$/m)?.[1];
          if (!name || !exec) continue;
          exec = exec.replace(/%[fFuUdDnNickvm]/g, '').trim();
          apps.push({ name, command: exec });
        } catch { /* skip broken entries */ }
      }
    }
  } else {
    const roots = [
      path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs')
    ];
    const walk = (dir, depth) => {
      if (depth > 2) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.name.endsWith('.lnk')) apps.push({ name: e.name.replace(/\.lnk$/, ''), command: `start "" "${full}"` });
      }
    };
    for (const r of roots) walk(r, 0);
  }
  const seen = new Set();
  return apps.filter(a => !seen.has(a.name) && seen.add(a.name)).sort((a, b) => a.name.localeCompare(b.name));
}

// ---- autostart ----
const AUTOSTART_FILE =path.join(os.homedir(), '.config', 'autostart', 'bloom.desktop');
function setAutostart(enabled) {
  if (IS_WIN) { app.setLoginItemSettings({ openAtLogin: enabled }); return true; }
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(AUTOSTART_FILE), { recursive: true });
      const exec = app.isPackaged ? process.execPath : `${process.execPath} ${app.getAppPath()} --no-sandbox`;
      // NoDisplay + StartupWMClass keep Bloom a background service, not a launchable app.
      fs.writeFileSync(AUTOSTART_FILE,
        `[Desktop Entry]\nType=Application\nName=Bloom\nComment=Radial action launcher\n` +
        `Exec=${exec}\nTerminal=false\nNoDisplay=true\nStartupWMClass=bloom\n` +
        `X-GNOME-Autostart-enabled=true\n`);
    } else if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE);
    return true;
  } catch { return false; }
}
function getAutostart() {
  if (IS_WIN) return app.getLoginItemSettings().openAtLogin;
  return fs.existsSync(AUTOSTART_FILE);
}

// ---- ipc ----
function wireIPC() {
  ipcMain.handle('get-config', () => cfg);

  ipcMain.handle('patch-config', (_e, partial) => {
    if (partial && partial.__reset) {
      cfg = store.defaults();
      cfg.seenOnboarding = true;
      store.save(cfg);
    } else {
      const hadHotkeys = JSON.stringify([cfg.hotkeys, cfg.quickfire]);
      const hadSize = cfg.bud.size;
      cfg = store.patch(partial);
      if (JSON.stringify([cfg.hotkeys, cfg.quickfire]) !== hadHotkeys) registerShortcuts();
      if (cfg.bud.size !== hadSize && budWin) {
        const c = budCenter();
        placeBud(c.x, c.y); // resize the window around the same center
      }
    }
    broadcast('config-changed', cfg);
    return cfg;
  });

  ipcMain.handle('save-tree', (_e, root) => {
    if (root && root.id === 'root') {
      cfg.root = root;
      if (cfg.favoriteId && !store.findNode(cfg.root, cfg.favoriteId)) cfg.favoriteId = null;
      if (cfg.holdFavoriteId && !store.findNode(cfg.root, cfg.holdFavoriteId)) cfg.holdFavoriteId = null;
      cfg.pinnedIds = (cfg.pinnedIds || []).filter(id => store.findNode(cfg.root, id));
      store.save(cfg);
      broadcast('config-changed', cfg);
    }
    return cfg;
  });

  ipcMain.handle('execute', (_e, node) => execute(node));
  ipcMain.handle('list-apps', () => listApps());
  ipcMain.handle('open-settings', (_e, tab) => createSettings(tab));
  ipcMain.handle('quit', () => app.quit());
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('set-autostart', (_e, v) => setAutostart(!!v));
  ipcMain.handle('get-autostart', () => getAutostart());
  ipcMain.handle('relaunch-onboarding', () => {
    cfg.seenOnboarding = false;
    store.save(cfg);
    broadcast('config-changed', cfg);
    createOnboardWin();
  });
  ipcMain.on('onboarding-done', () => finishOnboarding());

  // Custom window controls for the frameless settings window.
  ipcMain.on('win-min', e =>BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('win-max', e => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on('win-close', e => BrowserWindow.fromWebContents(e.sender)?.close());

  ipcMain.handle('capture', async () => {
    try {
      const disp = screen.getDisplayNearestPoint(budCenter());
      const { width, height } = disp.size;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width / 2), height: Math.round(height / 2) }
      });
      const src = sources.find(s => String(s.display_id) === String(disp.id)) || sources[0];
      if (!src) return null;
      const u = ovBounds || unionBounds();
      // Rect of this display inside the overlay's union coordinate space.
      return {
        dataURL: src.thumbnail.toDataURL(),
        rect: { x: disp.bounds.x - u.x, y: disp.bounds.y - u.y, width: disp.bounds.width, height: disp.bounds.height }
      };
    } catch { return null; }
  });

  ipcMain.handle('export-config', async () => {
    const r = await dialog.showSaveDialog(settingsWin || undefined, {
      title: 'Export Bloom configuration',
      defaultPath: path.join(os.homedir(), 'bloom-config.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' };
    try { fs.writeFileSync(r.filePath, JSON.stringify(cfg, null, 2)); return { ok: true, path: r.filePath }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('import-config', async () => {
    const r = await dialog.showOpenDialog(settingsWin || undefined, {
      title: 'Import Bloom configuration',
      filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile']
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'cancelled' };
    try {
      const incoming = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      if (!incoming || !incoming.root) return { ok: false, error: 'not a Bloom config (missing root)' };
      cfg = store.merge(store.defaults(), incoming);
      store.save(cfg);
      registerShortcuts();
      broadcast('config-changed', cfg);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Overlay → main: what the overlay needs from the OS right now.
  let ringConfirmed = false;
  ipcMain.on('ui-state', (_e, s) => {
    uiFlags.ringOpen = !!s.ringOpen;
    uiFlags.uiActive = !!s.uiActive;
    uiFlags.displayOnly = !!s.displayOnly;
    if (s.ringOpen && !ringConfirmed) {
      ringConfirmed = true;
      setTimeout(() => { if (ringConfirmed) concealBud(); }, 60); // after the overlay paints its bud
    } else if (!s.ringOpen && ringConfirmed) {
      ringConfirmed = false;
      endGhost();
      if (!cfg.bud.hidden) revealBud();
    }
    if (!uiFlags.ringOpen) endGhost();
    applyOverlayState();
  });

  // Bud window → main: semantic input events.
  ipcMain.on('bud-cmd', (_e, m) => {
    switch (m.cmd) {
      case 'open-ring': summonRing(); break;
      case 'pop': overlay?.webContents.send('pop-ring'); break;
      case 'favorite': execFavorite(cfg.favoriteId, 'double-tap favourite'); break;
      case 'hold-favorite': execFavorite(cfg.holdFavoriteId, 'hold favourite'); break;
      case 'dictate-toggle': toggleDictation(); break;
      case 'dictate-stop': stopDictation(); break;
      case 'speak': speakSelection(); break;
      case 'speak-stop': stopSpeaking(); break;

      case 'ctx': {
        uiFlags.uiActive = true; applyOverlayState();
        overlay?.webContents.send('show-ctx');
        break;
      }
      case 'wheel': {
        if (cfg.behavior.scrollCycle === false) break;
        if (!uiFlags.ringOpen && !uiFlags.uiActive) { uiFlags.displayOnly = true; applyOverlayState(); }
        overlay?.webContents.send('chip-wheel', { dir: m.dir });
        break;
      }
      case 'chip-run': overlay?.webContents.send('chip-run'); break;
      case 'key': overlay?.webContents.send('bud-key', { key: m.key, shift: !!m.shift }); break;
      case 'drag': placeBud(m.cx, m.cy); break;
      case 'drag-end': {
        let { cx, cy } = m;
        if (cfg.behavior.edgeSnap !== false) {
          const d = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(cy) });
          const margin = 16 + cfg.bud.size / 2, snap = 34;
          if (cx - d.bounds.x < snap + cfg.bud.size / 2) cx = d.bounds.x + margin;
          else if (d.bounds.x + d.bounds.width - cx < snap + cfg.bud.size / 2) cx = d.bounds.x + d.bounds.width - margin;
          if (cy - d.bounds.y < snap + cfg.bud.size / 2) cy = d.bounds.y + margin;
          else if (d.bounds.y + d.bounds.height - cy < snap + cfg.bud.size / 2) cy = d.bounds.y + d.bounds.height - margin;
        }
        placeBud(cx, cy);
        persistBud();
        break;
      }
      case 'drop': {
        if (!m.path) break;
        summonFileRing(m.path);
        break;
      }
    }
  });

  // Hidden voice window → main. State/level animate the orb; result gets injected.
  ipcMain.on('voice-event', (_e, ev) => {
    switch (ev.type) {
      case 'level': if (voiceState === 'listening') setVoiceState('listening', ev.value); break;
      case 'listening': setVoiceState('listening'); break;    // mic actually live
      case 'result': injectText(ev.text); break;
      case 'error':
        setVoiceState('idle');
        voiceToast(ev.message || 'Voice error', false);
        break;
    }
  });

  // Transcribe 16kHz mono Float32 PCM → text, via the Whisper pipeline.
  ipcMain.handle('transcribe', async (_e, pcm) => {
    try {
      const model = await getWhisper();
      const audio = pcm instanceof Float32Array ? pcm : Float32Array.from(pcm);
      // chunk_length_s enables long-form transcription — without it Whisper only
      // sees the first 30s and returns empty text for longer clips.
      const out = await model(audio, { language: cfg.voice.language || 'en', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      return { text: (out?.text || '').trim() };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  });

  // Updates: check / download / install, plus current version for the About page.
  ipcMain.handle('update-check', () => checkForUpdates(false));
  ipcMain.handle('update-download', async () => {
    const up = getUpdater(); if (!up) return;
    applyUpdateChannel(up);
    try { await up.downloadUpdate(); }
    catch (e) { broadcast('update-status', { event: 'error', info: { message: String(e?.message || e) } }); }
  });
  ipcMain.on('update-install', () => { const up = getUpdater(); if (up) up.quitAndInstall(); });

  // Voices for the Settings read-aloud picker.
  ipcMain.handle('list-voices', () => listVoices().catch(() => []));
  // Speak a short sample when the user picks a voice in Settings.
  ipcMain.on('preview-voice', (_e, voice) => { osSpeak('Hi — this is how I sound.', cfg.voice.ttsRate || 1, voice); });

  ipcMain.on('tray-icon', (_e, dataURL) => {
    lastTrayIcon = dataURL;
    try { createTray(dataURL); } catch { /* tray unavailable in some sandboxes */ }
    // Reuse the same mark as the settings/onboarding window icon.
    try {
      const img = nativeImage.createFromDataURL(dataURL);
      for (const w of [settingsWin, onboardWin]) if (w && !w.isDestroyed()) w.setIcon(img);
    } catch { /* setIcon is a no-op on some platforms */ }
  });
}

function summonFileRing(filePath) {
  if (!overlay) return;
  uiFlags.ringOpen = true;
  applyOverlayState();
  const c = budCenter();
  overlay.webContents.send('summon-ring', {
    budLocal: { x: c.x - ovBounds.x, y: c.y - ovBounds.y },
    filePath
  });
}

// ---- boot ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => summonRing());

  app.whenReady().then(async () => {
    cfg = store.load();
    // Start with no dock icon (macOS); updateDock() reveals it while a real window is open.
    if (process.platform === 'darwin') app.dock?.hide();
    // First run only: default launch-at-login on; afterwards the user's Settings toggle wins.
    if (!cfg.autostartDefaulted) {
      cfg.autostartDefaulted = true;
      setAutostart(true);
      store.save(cfg);
    }
    wireIPC();
    registerShortcuts();
    // Let the hidden voice window use the microphone without prompting.
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'audioCapture'));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media' || perm === 'audioCapture');
    // X11 transparency needs a beat after ready before creating windows
    if (IS_LINUX) await sleep(300);
    createOverlay();
    createBudWin();
    createVoiceWin();
    if (!cfg.seenOnboarding) createOnboardWin();
    try { createTray(blankIcon()); } catch { /* no tray in this environment */ }
    if (store.recoveredFrom) {
      setTimeout(() => {
        uiFlags.displayOnly = true; applyOverlayState();
        overlay?.webContents.send('exec-feedback', {
          nodeId: null, label: 'Config', ok: true,
          note: `Restored from backup (${store.recoveredFrom}) after an unclean shutdown`
        });
      }, 2500);
    }
    // Quietly check for updates a few seconds after launch.
    if (cfg.updates?.autoCheck !== false) setTimeout(() => checkForUpdates(true), 4000);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
