// Bloom config store — single JSON file, atomic writes, rolling backups (keep 5).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';

function configDir() {
  if (IS_WIN) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Bloom');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'bloom');
}

const DIR = configDir();
const FILE = path.join(DIR, 'config.json');
const BAK_DIR = path.join(DIR, 'backups');

// ---------------------------------------------------------------- defaults
function defaultTree() {
  const L = !IS_WIN; // linux-flavored commands; every command is plain editable text
  return {
    id: 'root', type: 'folder', label: 'Bloom', icon: 'bloom', children: [
      {
        id: 'apps', type: 'folder', label: 'Apps', icon: 'grid', color: '#5EEAD4', children: [
          { id: 'files', type: 'launch_app', label: 'Files', icon: 'folder', params: { command: L ? 'xdg-open ~' : 'explorer.exe %USERPROFILE%' } },
          { id: 'editor', type: 'launch_app', label: 'Text Editor', icon: 'pencil', params: { command: L ? 'gedit || xdg-open ~' : 'notepad.exe' } },
          { id: 'calc', type: 'launch_app', label: 'Calculator', icon: 'cpu', params: { command: L ? 'gnome-calculator' : 'calc.exe' } },
          { id: 'sysmon', type: 'launch_app', label: 'System Monitor', icon: 'activity', params: { command: L ? 'gnome-system-monitor' : 'taskmgr.exe' } }
        ]
      },
      {
        id: 'browser', type: 'folder', label: 'Browser', icon: 'globe', color: '#7DD3FC', children: [
          { id: 'newtab', type: 'open_url', label: 'New Tab', icon: 'plus', params: { urls: ['https://www.google.com'], browser: 'default' } },
          { id: 'worktabs', type: 'open_url', label: 'Work Tabs', icon: 'briefcase', params: { urls: ['https://mail.google.com', 'https://calendar.google.com'], browser: 'default' } },
          { id: 'github', type: 'open_url', label: 'GitHub', icon: 'code', params: { urls: ['https://github.com'], browser: 'default' } },
          { id: 'yt', type: 'open_url', label: 'YouTube', icon: 'play', params: { urls: ['https://youtube.com'], browser: 'default' } }
        ]
      },
      {
        id: 'terminal', type: 'folder', label: 'Terminal', icon: 'terminal', color: '#A78BFA', children: [
          { id: 'term-home', type: 'terminal', label: 'Home', icon: 'home', params: { cwd: '~', command: '', terminal: 'default' } },
          { id: 'term-proj', type: 'terminal', label: 'Projects', icon: 'folder-open', params: { cwd: '~/projects', command: '', terminal: 'default' } },
          { id: 'term-top', type: 'terminal', label: 'Processes', icon: 'activity', params: { cwd: '~', command: L ? 'htop || top' : '', terminal: 'default' } }
        ]
      },
      {
        id: 'system', type: 'folder', label: 'System', icon: 'monitor', color: '#F472B6', children: [
          { id: 'screenshot', type: 'system_toggle', label: 'Screenshot', icon: 'camera', params: { toggle: 'screenshot' } },
          { id: 'lock', type: 'system_toggle', label: 'Lock Screen', icon: 'lock', params: { toggle: 'lock' } },
          { id: 'darkmode', type: 'system_toggle', label: 'Dark Mode', icon: 'moon', params: { toggle: 'dark_theme' } },
          { id: 'nightlight', type: 'system_toggle', label: 'Night Light', icon: 'sun', params: { toggle: 'night_light' } },
          { id: 'mute', type: 'system_toggle', label: 'Mute', icon: 'volume-x', params: { toggle: 'mute' } },
          { id: 'sleep', type: 'system_toggle', label: 'Sleep', icon: 'zzz', params: { toggle: 'sleep', confirm: true } }
        ]
      },
      {
        id: 'media', type: 'folder', label: 'Media', icon: 'music', color: '#FBBF24', children: [
          { id: 'playpause', type: 'media', label: 'Play / Pause', icon: 'play', params: { key: 'playpause' } },
          { id: 'next', type: 'media', label: 'Next', icon: 'skip-fwd', params: { key: 'next' } },
          { id: 'prev', type: 'media', label: 'Previous', icon: 'skip-back', params: { key: 'prev' } },
          { id: 'volup', type: 'media', label: 'Volume +', icon: 'volume', params: { key: 'volup' } },
          { id: 'voldown', type: 'media', label: 'Volume −', icon: 'volume-low', params: { key: 'voldown' } }
        ]
      },
      {
        id: 'snippets', type: 'folder', label: 'Snippets', icon: 'clipboard', color: '#34D399', children: [
          { id: 'snip-shrug', type: 'snippet', label: 'Shrug', icon: 'sparkle', params: { text: '¯\\_(ツ)_/¯', mode: 'copy' } },
          { id: 'snip-mail', type: 'snippet', label: 'My Email', icon: 'mail', params: { text: 'you@example.com', mode: 'copy' } },
          { id: 'snip-bloom', type: 'snippet', label: 'Bloom Sig', icon: 'bloom', params: { text: '— sent one bloom away 🌸', mode: 'copy' } }
        ]
      },
      {
        id: 'start-day', type: 'macro', label: 'Start My Day', icon: 'zap', color: '#FB923C', params: {
          steps: [
            { action: 'open_url', urls: ['https://mail.google.com'], browser: 'default' },
            { action: 'wait', ms: 1200 },
            { action: 'open_url', urls: ['https://calendar.google.com'], browser: 'default' }
          ]
        }
      },
      { id: 'bloom-settings', type: 'bloom', label: 'Settings', icon: 'gear', params: { cmd: 'settings' } }
    ]
  };
}

// Bloom's one look: flat opaque dial, a single accent, only sizes and pacing tunable.
const BLOOM_APPEARANCE = {
  flat: true,
  ringStyle: 'dial',
  accentA: '#007ACC', accentB: '#007ACC',
  blur: 0, tint: 0.14, saturation: 100, glow: 0,
  hoverTint: 0.2,
  dim: 0.35,
  nodeSize: 44, nodeShape: 'circle',
  ringRadius: 108, ringGap: 52,
  labelMode: 'never',
  iconMode: 'color',
  grain: false, frost: false,
  motionScale: 1, reduceTransparency: false
};

function defaults() {
  return {
    version: 1,
    bud: { x: null, y: null, size: 44, idleOpacity: 0.85, pinned: false, hidden: false },
    appearance: { ...BLOOM_APPEARANCE },
    hotkeys: { toggleRing: 'Control+Alt+Space', palette: 'Control+Shift+Space', dictate: 'Control+Alt+D', speak: 'Control+Alt+R' },
    quickfire: {},                                  // nodeId -> accelerator
    // doubleClickAction: 'dictate'|'favorite' ; holdAction: 'speak'|'favorite'
    behavior: { hoverOpenDelay: 240, edgeSnap: true, scrollCycle: true, doubleClickAction: 'dictate', holdAction: 'speak' },
    favoriteId: 'term-home',           // double-tap favourite (when doubleClickAction='favorite')
    holdFavoriteId: null,              // hold favourite (when holdAction='favorite')
    voice: { model: 'Xenova/whisper-base.en', language: 'en', ttsVoice: '', ttsRate: 1 },
    updates: { autoCheck: true, channel: 'stable' },   // channel: 'stable' | 'beta'
    pinnedIds: ['screenshot', 'playpause', 'worktabs'],
    seenOnboarding: false,
    autostartDefaulted: false,        // first run enables launch-at-login once
    settingsBounds: null,
    profiles: { active: 'Default', saved: {} },   // saved[name] = {root, favoriteId, pinnedIds, appearance}
    root: defaultTree()
  };
}

// ---------------------------------------------------------------- io
function ensureDirs() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(BAK_DIR, { recursive: true });
}

let cache = null;
let recoveredFrom = null;

function load() {
  if (cache) return cache;
  ensureDirs();
  const candidates = [FILE, ...[1, 2, 3, 4, 5].map(i => path.join(BAK_DIR, `config-${i}.json`))];
  for (const f of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !parsed.root) continue;
      cache = merge(defaults(), parsed);
      if (f !== FILE) recoveredFrom = path.basename(f);
      return cache;
    } catch { /* try the next backup */ }
  }
  cache = defaults();
  save(cache);
  return cache;
}

function save(cfg) {
  cache = cfg;
  ensureDirs();
  try {
    if (fs.existsSync(FILE)) {
      for (let i = 4; i >= 1; i--) {
        const from = path.join(BAK_DIR, `config-${i}.json`);
        if (fs.existsSync(from)) fs.renameSync(from, path.join(BAK_DIR, `config-${i + 1}.json`));
      }
      fs.copyFileSync(FILE, path.join(BAK_DIR, 'config-1.json'));
    }
  } catch { /* backups are best-effort */ }
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, FILE);
}

// deep merge: objects merge, arrays & scalars replace
function merge(base, over) {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over !== undefined ? over : base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null)
      ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

function patch(partial) {
  const cfg = merge(load(), partial);
  save(cfg);
  return cfg;
}

function findNode(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

module.exports = { load, save, patch, merge, findNode, defaults, FILE, DIR, get recoveredFrom() { return recoveredFrom; } };
