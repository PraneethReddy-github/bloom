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
// Pomodoro presets ARE actions, so "customise a preset" is just "edit a node" —
// no parallel preset store, and the dial picks up new ones for free.
// No colour override: like Settings and Tasks, it rides the one global accent.
function focusFolder() {
  return {
    id: 'focus', type: 'folder', label: 'Focus', icon: 'timer', children: [
      { id: 'focus-20-10', type: 'focus', label: '20 / 10', icon: 'timer', params: { cmd: 'start', focusMin: 20, breakMin: 10 } },
      { id: 'focus-40-20', type: 'focus', label: '40 / 20', icon: 'timer', params: { cmd: 'start', focusMin: 40, breakMin: 20 } },
      { id: 'focus-50-10', type: 'focus', label: '50 / 10', icon: 'timer', params: { cmd: 'start', focusMin: 50, breakMin: 10 } },
      { id: 'focus-custom', type: 'focus', label: 'Custom…', icon: 'plus', params: { cmd: 'custom' } },
      { id: 'focus-pause', type: 'focus', label: 'Pause', icon: 'pause', params: { cmd: 'pause' } },
      { id: 'focus-stop', type: 'focus', label: 'Stop', icon: 'square', params: { cmd: 'stop' } }
    ]
  };
}
const tasksNode = () => ({ id: 'bloom-tasks', type: 'bloom', label: 'Tasks', icon: 'target', params: { cmd: 'tasks' } });
// Every template opens the day with one tap, so this lives on the root ring, never
// buried a layer down where you'd have to go looking for it.
const startDay = (id, steps) => ({ id, type: 'macro', label: 'Start My Day', icon: 'zap', color: '#FB923C', params: { steps } });
const settingsNode = () => ({ id: 'bloom-settings', type: 'bloom', label: 'Settings', icon: 'gear', params: { cmd: 'settings' } });

function defaultTree() {
  const L = !IS_WIN; // linux-flavored commands; every command is plain editable text
  return {
    id: 'root', type: 'folder', label: 'Bloom', icon: 'bloom', children: [
      {
        id: 'apps', type: 'folder', label: 'Apps', icon: 'grid', color: '#5EEAD4', children: [
          { id: 'files', type: 'launch_app', label: 'Files', icon: 'folder', params: { command: L ? 'xdg-open ~' : 'explorer.exe %USERPROFILE%' } },
          { id: 'vscode', type: 'launch_app', label: 'VS Code', icon: 'code', params: { command: 'code' } },
          { id: 'calc', type: 'launch_app', label: 'Calculator', icon: 'calculator', params: { command: L ? 'gnome-calculator' : 'calc.exe' } },
          { id: 'sysmon', type: 'launch_app', label: 'System Monitor', icon: 'activity', params: { command: L ? 'gnome-system-monitor' : 'taskmgr.exe' } }
        ]
      },
      {
        id: 'browser', type: 'folder', label: 'Browser', icon: 'globe', color: '#7DD3FC', children: [
          { id: 'newtab', type: 'open_url', label: 'New Tab', icon: 'plus', params: { urls: ['https://www.google.com'] } },
          { id: 'worktabs', type: 'open_url', label: 'Work Tabs', icon: 'briefcase', params: { urls: ['https://outlook.office.com', 'https://jira.atlassian.com'] } },
          { id: 'github', type: 'open_url', label: 'GitHub', icon: 'code', params: { urls: ['https://github.com'] } },
          { id: 'yt', type: 'open_url', label: 'YouTube', icon: 'play', params: { urls: ['https://youtube.com'] } }
        ]
      },
      {
        id: 'terminal', type: 'folder', label: 'Terminal', icon: 'terminal', color: '#A78BFA', children: [
          { id: 'term-home', type: 'terminal', label: 'Home', icon: 'home', params: { cwd: '~', command: '', terminal: 'default' } },
          { id: 'term-down', type: 'terminal', label: 'Downloads', icon: 'download', params: { cwd: '~/Downloads', command: '', terminal: 'default' } },
          { id: 'term-top', type: 'terminal', label: 'Processes', icon: 'activity', params: { cwd: '~', command: L ? 'htop || top' : '', terminal: 'default' } }
        ]
      },
      {
        id: 'system', type: 'folder', label: 'System', icon: 'monitor', color: '#F472B6', children: [
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
        id: 'snippets', type: 'folder', label: 'Snippets', icon: 'snippet', color: '#34D399', children: [
          { id: 'snip-address', type: 'snippet', label: 'My Address', icon: 'home', params: { text: 'No.123, 12th Main, Bloom St, Bloom -560016', mode: 'copy' } },
          { id: 'snip-zoom', type: 'snippet', label: 'Zoom Room', icon: 'video', params: { text: 'https://zoom.in', mode: 'copy' } },
          { id: 'snip-phone', type: 'snippet', label: 'Phone No.', icon: 'phone', params: { text: '+91 9019919191', mode: 'copy' } }
        ]
      },
      focusFolder(),
      startDay('start-day', [
        { action: 'open_url', urls: ['https://outlook.office.com'] },
        { action: 'wait', ms: 1200 },
        { action: 'open_url', urls: ['https://jira.atlassian.com'] }
      ]),
      tasksNode(),
      settingsNode()
    ]
  };
}

// ---------------------------------------------------------------- profile templates
// The starting points offered by the first-run question. Each one is a complete
// profile snapshot, so applying it and switching to it later use the same code path.
const TEMPLATES = {
  default: {
    label: 'Default',
    blurb: 'The stock Bloom setup — a bit of everything, nothing assumed.',
    icon: 'bloom',
    for: 'A general starting point you can carve down',
    build: () => ({ pinnedIds: ['term-home', 'playpause', 'worktabs'], root: defaultTree() })
  },
  maker: {
    label: 'Maker',
    blurb: 'Editors, terminals and docs, tuned for long uninterrupted blocks.',
    icon: 'code',
    for: 'Developers, designers and anyone who builds things',
    build() {
      const L = !IS_WIN;
      return {
        pinnedIds: ['term-home', 'focus-50-10', 'vscode'],
        root: {
          id: 'root', type: 'folder', label: 'Bloom', icon: 'bloom', children: [
            {
              id: 'code', type: 'folder', label: 'Code', icon: 'code', color: '#7DD3FC', children: [
                { id: 'vscode', type: 'launch_app', label: 'VS Code', icon: 'code', params: { command: 'code', focusIfRunning: true } },
                { id: 'term-home', type: 'terminal', label: 'Terminal', icon: 'terminal', params: { cwd: '~', command: '', terminal: 'default' } },
                { id: 'term-proj', type: 'terminal', label: 'Projects', icon: 'folder-open', params: { cwd: '~/Projects', command: '', terminal: 'default' } },
                { id: 'github', type: 'open_url', label: 'GitHub', icon: 'git-branch', params: { urls: ['https://github.com'] } },
                { id: 'localhost', type: 'open_url', label: 'Localhost', icon: 'server', params: { urls: ['http://localhost:3000'] } }
              ]
            },
            startDay('start-day', [
              { action: 'launch_app', command: 'code' },
              { action: 'wait', ms: 1200 },
              { action: 'open_url', urls: ['https://github.com'] }
            ]),
            focusFolder(),
            {
              id: 'browser', type: 'folder', label: 'Browser', icon: 'globe', color: '#7DD3FC', children: [
                { id: 'newtab', type: 'open_url', label: 'New Tab', icon: 'plus', params: { urls: ['https://www.google.com'] } },
                { id: 'docs', type: 'open_url', label: 'MDN', icon: 'book', params: { urls: ['https://developer.mozilla.org'] } },
                { id: 'so', type: 'open_url', label: 'Stack Overflow', icon: 'layers', params: { urls: ['https://stackoverflow.com'] } }
              ]
            },
            {
              id: 'apps', type: 'folder', label: 'Apps', icon: 'grid', color: '#5EEAD4', children: [
                { id: 'files', type: 'launch_app', label: 'Files', icon: 'folder', params: { command: L ? 'xdg-open ~' : 'explorer.exe %USERPROFILE%' } },
                { id: 'sysmon', type: 'launch_app', label: 'System Monitor', icon: 'activity', params: { command: L ? 'gnome-system-monitor' : 'taskmgr.exe' } }
              ]
            },
            {
              id: 'system', type: 'folder', label: 'System', icon: 'monitor', color: '#F472B6', children: [
                { id: 'lock', type: 'system_toggle', label: 'Lock Screen', icon: 'lock', params: { toggle: 'lock' } },
                { id: 'darkmode', type: 'system_toggle', label: 'Dark Mode', icon: 'moon', params: { toggle: 'dark_theme' } },
                { id: 'dnd', type: 'system_toggle', label: 'Do Not Disturb', icon: 'bell', params: { toggle: 'dnd_on' } },
                { id: 'mute', type: 'system_toggle', label: 'Mute', icon: 'volume-x', params: { toggle: 'mute' } }
              ]
            },
            tasksNode(),
            settingsNode()
          ]
        }
      };
    }
  },

  coordinator: {
    label: 'Coordinator',
    blurb: 'Mail, calendar and the details you paste all day, in short sprints.',
    icon: 'users',
    for: 'Managers, founders and anyone whose day is people-shaped',
    build() {
      const L = !IS_WIN;
      return {
        pinnedIds: ['worktabs', 'focus-20-10', 'snip-zoom'],
        root: {
          id: 'root', type: 'folder', label: 'Bloom', icon: 'bloom', children: [
            {
              id: 'work', type: 'folder', label: 'Work', icon: 'briefcase', color: '#7DD3FC', children: [
                { id: 'mail', type: 'open_url', label: 'Mail', icon: 'mail', params: { urls: ['https://outlook.office.com'] } },
                { id: 'calendar', type: 'open_url', label: 'Calendar', icon: 'calendar', params: { urls: ['https://calendar.google.com'] } },
                { id: 'meet', type: 'open_url', label: 'Meet', icon: 'video', params: { urls: ['https://meet.google.com'] } },
                { id: 'board', type: 'open_url', label: 'Board', icon: 'clipboard', params: { urls: ['https://jira.atlassian.com'] } }
              ]
            },
            startDay('worktabs', [
              { action: 'open_url', urls: ['https://outlook.office.com'] },
              { action: 'wait', ms: 1200 },
              { action: 'open_url', urls: ['https://calendar.google.com'] }
            ]),
            focusFolder(),
            {
              id: 'snippets', type: 'folder', label: 'Snippets', icon: 'snippet', color: '#34D399', children: [
                { id: 'snip-zoom', type: 'snippet', label: 'Meeting Room', icon: 'video', params: { text: 'https://zoom.us/j/0000000000', mode: 'copy' } },
                { id: 'snip-phone', type: 'snippet', label: 'Phone No.', icon: 'phone', params: { text: '+1 555 0100', mode: 'copy' } },
                { id: 'snip-address', type: 'snippet', label: 'Address', icon: 'home', params: { text: 'Edit me in Settings › Actions', mode: 'copy' } }
              ]
            },
            {
              id: 'apps', type: 'folder', label: 'Apps', icon: 'grid', color: '#5EEAD4', children: [
                { id: 'files', type: 'launch_app', label: 'Files', icon: 'folder', params: { command: L ? 'xdg-open ~' : 'explorer.exe %USERPROFILE%' } },
                { id: 'calc', type: 'launch_app', label: 'Calculator', icon: 'calculator', params: { command: L ? 'gnome-calculator' : 'calc.exe' } }
              ]
            },
            {
              id: 'system', type: 'folder', label: 'System', icon: 'monitor', color: '#F472B6', children: [
                { id: 'dnd', type: 'system_toggle', label: 'Do Not Disturb', icon: 'bell', params: { toggle: 'dnd_on' } },
                { id: 'mute', type: 'system_toggle', label: 'Mute', icon: 'volume-x', params: { toggle: 'mute' } },
                { id: 'lock', type: 'system_toggle', label: 'Lock Screen', icon: 'lock', params: { toggle: 'lock' } }
              ]
            },
            tasksNode(),
            settingsNode()
          ]
        }
      };
    }
  },

  explorer: {
    label: 'Explorer',
    blurb: 'Reading, watching and making, with media and short study sprints.',
    icon: 'sparkle',
    for: 'Students, writers, creators and everyday desktops',
    build() {
      const L = !IS_WIN;
      return {
        pinnedIds: ['playpause', 'focus-20-10', 'notes'],
        root: {
          id: 'root', type: 'folder', label: 'Bloom', icon: 'bloom', children: [
            {
              id: 'study', type: 'folder', label: 'Study', icon: 'book', color: '#7DD3FC', children: [
                { id: 'notes', type: 'open_url', label: 'Notes', icon: 'text', params: { urls: ['https://keep.google.com'] } },
                { id: 'drive', type: 'open_url', label: 'Drive', icon: 'cloud', params: { urls: ['https://drive.google.com'] } },
                { id: 'search', type: 'open_url', label: 'Search', icon: 'search', params: { urls: ['https://www.google.com'] } },
                { id: 'wiki', type: 'open_url', label: 'Wikipedia', icon: 'book', params: { urls: ['https://wikipedia.org'] } }
              ]
            },
            startDay('start-day', [
              { action: 'open_url', urls: ['https://keep.google.com'] },
              { action: 'wait', ms: 1200 },
              { action: 'open_url', urls: ['https://drive.google.com'] }
            ]),
            focusFolder(),
            {
              id: 'media', type: 'folder', label: 'Media', icon: 'music', color: '#FBBF24', children: [
                { id: 'playpause', type: 'media', label: 'Play / Pause', icon: 'play', params: { key: 'playpause' } },
                { id: 'next', type: 'media', label: 'Next', icon: 'skip-fwd', params: { key: 'next' } },
                { id: 'prev', type: 'media', label: 'Previous', icon: 'skip-back', params: { key: 'prev' } },
                { id: 'yt', type: 'open_url', label: 'YouTube', icon: 'video', params: { urls: ['https://youtube.com'] } }
              ]
            },
            {
              id: 'apps', type: 'folder', label: 'Apps', icon: 'grid', color: '#5EEAD4', children: [
                { id: 'files', type: 'launch_app', label: 'Files', icon: 'folder', params: { command: L ? 'xdg-open ~' : 'explorer.exe %USERPROFILE%' } },
                { id: 'calc', type: 'launch_app', label: 'Calculator', icon: 'calculator', params: { command: L ? 'gnome-calculator' : 'calc.exe' } }
              ]
            },
            {
              id: 'system', type: 'folder', label: 'System', icon: 'monitor', color: '#F472B6', children: [
                { id: 'darkmode', type: 'system_toggle', label: 'Dark Mode', icon: 'moon', params: { toggle: 'dark_theme' } },
                { id: 'nightlight', type: 'system_toggle', label: 'Night Light', icon: 'sun', params: { toggle: 'night_light' } },
                { id: 'mute', type: 'system_toggle', label: 'Mute', icon: 'volume-x', params: { toggle: 'mute' } },
                { id: 'lock', type: 'system_toggle', label: 'Lock Screen', icon: 'lock', params: { toggle: 'lock' } }
              ]
            },
            tasksNode(),
            settingsNode()
          ]
        }
      };
    }
  }
};

// What the onboarding questions offer, without the tree payload.
function templateList() {
  return Object.entries(TEMPLATES).map(([key, t]) =>
    ({ key, label: t.label, blurb: t.blurb, icon: t.icon, for: t.for }));
}
function buildTemplate(key) {
  const t = TEMPLATES[key];
  return t ? t.build() : null;
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
    // The bud's gestures are fixed: double-tap dictates, hold reads the selection aloud.
    behavior: { hoverOpenDelay: 240, edgeSnap: true, scrollCycle: true },
    voice: { model: 'Xenova/whisper-base.en', language: 'en', ttsVoice: '', ttsRate: 1 },
    updates: { autoCheck: true, channel: 'stable' },   // channel: 'stable' | 'beta'
    // Pomodoro. The running timer itself lives in main's memory — only preferences persist.
    // sounds[event] is a built-in tone name, 'file:<path>' for your own audio, or 'silent'
    focus: {
      autoStartBreak: true, showRing: true, lastPreset: null,
      sounds: { focusEnd: 'chime', breakEnd: 'bell', volume: 0.7 }
    },
    tasks: [],                        // Eisenhower cards: {id, text, q, done, created}
    pinnedIds: ['term-home', 'playpause', 'worktabs'],
    seenOnboarding: false,
    seenTour: false,                  // settings-window coach marks, shown once
    focusMigrated: false,             // flipped by the one-time Focus/Tasks backfill on load
    autostartDefaulted: false,        // first run enables launch-at-login once
    settingsBounds: null,
    profiles: { active: 'Default', saved: {} },   // saved[name] = {root, pinnedIds}
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

// A tree written before the timer existed has nowhere to start one from. Add the
// Focus folder and the Tasks node once — after that the user owns the tree again,
// so deleting them sticks.
const RING_CAP = 12;                  // rings hard-cap at 12 items, same as the editor
function migrateFocus(cfg) {
  if (cfg.focusMigrated) return false;
  cfg.focusMigrated = true;
  const add = root => {
    if (!root || !Array.isArray(root.children)) return;
    let hasFocus = false, hasTasks = false;
    (function walk(n) {
      if (n.type === 'focus') hasFocus = true;
      if (n.type === 'bloom' && n.params && n.params.cmd === 'tasks') hasTasks = true;
      (n.children || []).forEach(walk);
    })(root);
    if (!hasFocus && root.children.length < RING_CAP) root.children.push(focusFolder());
    if (!hasTasks && root.children.length < RING_CAP) root.children.push(tasksNode());
  };
  add(cfg.root);
  for (const p of Object.values((cfg.profiles && cfg.profiles.saved) || {})) if (p) add(p.root);
  return true;
}

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
      if (migrateFocus(cache)) save(cache);
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

module.exports = {
  load, save, patch, merge, findNode, defaults, templateList, buildTemplate,
  FILE, DIR, get recoveredFrom() { return recoveredFrom; }
};
