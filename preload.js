// Bloom preload: the only bridge between renderer surfaces and the main process.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, cb) => {
  const ok = ['config-changed', 'summon-ring', 'summon-palette', 'exec-feedback', 'settings-tab', 'settings-cmd',
    'ui-flags', 'bud-pos', 'bud-conceal', 'pop-ring', 'close-ring', 'show-ctx', 'chip-wheel', 'chip-run', 'bud-key',
    'voice-ui', 'voice-cmd', 'update-status', 'focus-status', 'focus-tip', 'focus-custom', 'play-sound', 'hotkey-status',
    'garden-peers', 'garden-data', 'notif-push', 'notif-peek', 'notif-state'];
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
  openSettings: (tab, cmd) => ipcRenderer.invoke('open-settings', tab, cmd),
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

  // focus timer (pomodoro) — state lives in main, these all resolve to a snapshot
  focusGet: () => ipcRenderer.invoke('focus-get'),
  focusStart: (opts) => ipcRenderer.invoke('focus-start', opts),   // {focusMin, breakMin, taskId?}
  focusPause: () => ipcRenderer.invoke('focus-pause'),
  focusStop: () => ipcRenderer.invoke('focus-stop'),
  pickSound: () => ipcRenderer.invoke('pick-sound'),                  // absolute path | null
  previewSound: (o) => ipcRenderer.send('preview-sound', o),          // {tone, volume}

  // profile templates
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  applyTemplate: (opts) => ipcRenderer.invoke('apply-template', opts),   // {key, pace}

  // updates
  updateCheck: () => ipcRenderer.invoke('update-check'),
  releaseNotes: (version) => ipcRenderer.invoke('release-notes', version),   // {version, notes, date} | null
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

  // garden (LAN collaboration) — every mutation is a round trip so main stays the
  // single writer for conversation state
  gardenData: () => ipcRenderer.invoke('garden-data'),
  gardenSendMessage: (peerId, text) => ipcRenderer.invoke('garden-send-message', { peerId, text }),
  gardenSendTask: (peerId, task) => ipcRenderer.invoke('garden-send-task', { peerId, task }),
  gardenRequestMatrix: (peerId) => ipcRenderer.invoke('garden-request-matrix', { peerId }),
  gardenAnswerTask: (inboxId, accepted, q) => ipcRenderer.invoke('garden-answer-task', { inboxId, accepted, q }),
  gardenMarkRead: (peerId) => ipcRenderer.invoke('garden-mark-read', { peerId }),
  gardenReportDone: (peerId, title) => ipcRenderer.invoke('garden-report-done', { peerId, title }),
  gardenAckKey: (peerId) => ipcRenderer.invoke('garden-ack-key', { peerId }),
  gardenClearChat: (peerId) => ipcRenderer.invoke('garden-clear-chat', { peerId }),
  gardenForgetPeer: (peerId) => ipcRenderer.invoke('garden-forget-peer', { peerId }),
  gardenSetName: (name) => ipcRenderer.invoke('garden-set-name', name),
  gardenSetPublic: (pub) => ipcRenderer.invoke('garden-set-public', pub),
  gardenSetAvatar: (a) => ipcRenderer.invoke('garden-set-avatar', a),
  gardenAvatars: () => ipcRenderer.invoke('garden-avatars'),
  gardenViewing: (v) => ipcRenderer.send('garden-viewing', v),

  // notifications
  notifList: () => ipcRenderer.invoke('notif-list'),
  notifOpen: (id, peerId) => ipcRenderer.send('notif-open', { id, peerId }),
  notifDismiss: (id) => ipcRenderer.send('notif-dismiss', { id }),
  notifSeen: () => ipcRenderer.send('notif-seen'),
  notifHover: (on) => ipcRenderer.send('notif-hover', on),

  // events
  on
});
