// Bloom preload: the only bridge between renderer surfaces and the main process.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, cb) => {
  const ok = ['config-changed', 'summon-ring', 'summon-palette', 'exec-feedback', 'settings-tab',
    'ui-flags', 'bud-pos', 'bud-conceal', 'pop-ring', 'close-ring', 'show-ctx', 'chip-wheel', 'chip-run', 'bud-key',
    'voice-ui', 'voice-cmd', 'update-status'];
  if (!ok.includes(channel)) return;
  ipcRenderer.on(channel, (_e, data) => cb(data));
};

contextBridge.exposeInMainWorld('bloom', {
  // config
  getConfig: () => ipcRenderer.invoke('get-config'),
  patchConfig: (partial) => ipcRenderer.invoke('patch-config', partial),
  saveTree: (root) => ipcRenderer.invoke('save-tree', root),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // actions
  execute: (node) => ipcRenderer.invoke('execute', node),      // node object or id string -> {ok, error?}
  listApps: () => ipcRenderer.invoke('list-apps'),             // [{name, command}]

  // windows & app
  openSettings: (tab) => ipcRenderer.invoke('open-settings', tab),
  quit: () => ipcRenderer.invoke('quit'),
  setBudHidden: (hidden) => ipcRenderer.invoke('set-bud-hidden', hidden),
  relaunchOnboarding: () => ipcRenderer.invoke('relaunch-onboarding'),
  onboardingDone: () => ipcRenderer.send('onboarding-done'),
  winMin: () => ipcRenderer.send('win-min'),
  winMax: () => ipcRenderer.send('win-max'),
  winClose: () => ipcRenderer.send('win-close'),
  getPlatform: () => process.platform,
  getVersion: () => ipcRenderer.invoke('get-version'),
  listVoices: () => ipcRenderer.invoke('list-voices'),   // [{id, label}]
  previewVoice: (voice) => ipcRenderer.send('preview-voice', voice),

  // updates
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.send('update-install'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),

  // overlay plumbing
  uiState: (state) => ipcRenderer.send('ui-state', state),     // {ringOpen, uiActive, displayOnly}
  capture: () => ipcRenderer.invoke('capture'),                // desktop screenshot dataURL | null
  trayIcon: (dataURL) => ipcRenderer.send('tray-icon', dataURL),
  filePath: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },

  // bud window plumbing
  budCmd: (payload) => ipcRenderer.send('bud-cmd', payload),

  // voice window plumbing (hidden STT/TTS worker → main)
  voiceEvent: (payload) => ipcRenderer.send('voice-event', payload),
  transcribe: (pcm) => ipcRenderer.invoke('transcribe', pcm),   // Float32Array 16kHz mono -> {text} | {error}

  // events
  on
});
