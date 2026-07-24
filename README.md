# Bloom 🌸

[![Build and Test](https://github.com/Praneethreddy-github/bloom/actions/workflows/build-test.yml/badge.svg)](https://github.com/Praneethreddy-github/bloom/actions/workflows/build-test.yml)
[![Release](https://github.com/Praneethreddy-github/bloom/actions/workflows/release.yml/badge.svg)](https://github.com/Praneethreddy-github/bloom/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-A78BFA.svg)](#license)

*One bloom away.*

Bloom is a floating, draggable glass bud that lives on top of your desktop. Click it and a **dial** opens around it — select a folder and its contents open in a new ring just outside, while the layer you came from shrinks back and dims except the path that got you there. Go as deep as you need; step back any time with the bud, a hotkey, or the keyboard.

**[bloom-dial.web.app →](https://bloom-dial.web.app)**

---

## Contents

- [Download & Install](#download--install)
- [Building from source](#building-from-source)
- [Features & Usage](#features--usage)
- [Built-in Voice AI](#built-in-voice-ai-no-internet-required)
- [Actions Supported](#actions-supported)
- [Settings](#settings)
- [Tech stack](#tech-stack)
- [License](#license)

## Download & Install

Bloom is distributed as a single, self-contained application for Windows and Linux. All dependencies — including the local Whisper voice model and Linux window-management utilities — are fully bundled. It just works out of the box.

- **Windows**: download the latest `.exe` installer from [Releases](https://github.com/Praneethreddy-github/bloom/releases).
- **Linux**: download the `.deb` or `.AppImage` from [Releases](https://github.com/Praneethreddy-github/bloom/releases).

Updates are downloaded and installed automatically in the background.

## Building from source

Requires [Node.js](https://nodejs.org) 22+.

```bash
git clone https://github.com/Praneethreddy-github/bloom.git
cd bloom
npm install
npm start              # launches Bloom (electron . --no-sandbox)
```

To package an installer for a specific platform:

```bash
npm run dist:win        # NSIS installer for Windows
npm run dist:linux      # .deb + AppImage for Linux
npm run dist:mac        # macOS (partial support)
npm run dist            # all configured targets
```

Linux builds/runs need a few native tools available on `PATH` (already bundled in the packaged `.deb`, declared as its dependencies): `xdotool`, `wtype`, `wl-clipboard`, `xclip`, `speech-dispatcher`, `espeak-ng`, `libnotify4`, `libsecret-1-0`.

## Features & Usage

Bloom consists of two main elements: the **bud** (the small floating icon) and the **dial** (the menu it opens).

### The Bud

| Input | Result |
|---|---|
| **Click** | Open the dial (click again or click the bud to pop one layer) |
| **Double-click** | Starts Voice Dictation by default, or fires your ★ favorite action — configurable |
| **Long-press** | Triggers Read-Aloud (TTS) by default, or fires your favorite action — configurable |
| **Drag** | Move it anywhere (edge-snaps; position persists) |
| **Scroll** | Cycle through pinned actions in a chip — click the bud to run whichever one's showing |
| **Middle-click**| Hide to tray |
| **Right-click** | Edit Actions · Settings · Pin position · Hide · Quit |
| **Drop a file** | Shows a small ring: Open · Open folder · Copy path |

### Built-in Voice AI (No Internet Required)

Voice is one feature among many, not the whole product — but it's a real one, running fully locally:

- **Voice Dictation (Speech-to-Text)**: press `Ctrl+Alt+D` (or double-click the bud) to start talking. Bloom uses an embedded Whisper model (`Xenova/whisper-base.en`, via [`@xenova/transformers`](https://www.npmjs.com/package/@xenova/transformers)) to capture your voice, transcribe it, and instantly type it out wherever your cursor is. No network calls, no API keys.
- **Read-Aloud (Text-to-Speech)**: highlight any text on your screen and press `Ctrl+Alt+R` (or long-press the bud). Bloom reads the selected text aloud using your **operating system's own native TTS engine** (`spd-say`/`espeak-ng` on Linux, `say` on macOS, `System.Speech.Synthesis` on Windows) rather than Chromium's `speechSynthesis`, which ships with no usable voices on most Linux setups.

### Global Hotkeys

- `Ctrl+Alt+Space` summons the ring anywhere (at your cursor if the bud is hidden).
- `Ctrl+Shift+Space` opens the command palette — fuzzy-search every action regardless of depth.
- `Ctrl+Alt+D` toggles Voice Dictation.
- `Ctrl+Alt+R` triggers Read-Aloud for selected text.

These four hotkeys are always on, independent of whatever you've assigned to the bud's own double-click or long-press (all rebindable in Settings, with conflict detection).

### Inside the Dial

- Opening a folder doesn't replace the dial — its contents open in a new ring just outside, while the ring you came from shrinks and dims (except the item on the path to what's open), so you keep your bearings.
- Fully keyboard operable: `←/→` orbit the open ring, `↑` opens a focused folder, `↓` steps back one layer, `Enter` selects, `Esc`/`Backspace` backs out, `Home` jumps to root, `0–9` jump directly to a slot, `?` shows the cheat sheet.

## Actions Supported

Bloom is incredibly powerful and customizable. You can configure it to trigger:

- **Folders & App launches**
- **URLs** (specific browser + profile, multi-URL tab groups)
- **Terminal profiles** (cwd + command + emulator choice)
- **System toggles** (screenshot, lock, dark mode, night light, volume, Wi-Fi, Bluetooth, DND, sleep/restart/shutdown)
- **Media keys & Snippets** (copy/paste)
- **Open file/folder**
- **Custom scripts** (`.sh`/`.py`/`.ps1`/`.bat`)
- **Webhooks** (GET/POST)
- **Linear macros** with delays

Every action reports back — a toast confirms it ran, or names exactly why it didn't.

## Settings

Right-click the bud and select **Settings** to access the complete configuration interface:

- **Actions**: manage your action tree with a searchable outline and a wizard (with "Run now" testing). Drag to reorder, merge into folders, star a favorite, and pin actions.
- **Appearance**: Bloom has one look — a flat, opaque dial. Tune its size, spacing, pacing and accent color, with a live preview.
- **Hotkeys & Input**: rebind global hotkeys and set per-action quick-fire hotkeys.
- **Profiles**: snapshot and switch whole setups (tree + favorites + look).

Config is a single JSON file (`%APPDATA%/Bloom/config.json` on Windows, `~/.config/bloom/config.json` on Linux), written atomically with rolling backups — export/import it to back up or move your setup between machines.

## Tech stack

Bloom is an [Electron](https://www.electronjs.org/) app — plain HTML/CSS/vanilla JS in the renderer, no framework or build step. Packaged with [electron-builder](https://www.electron.build/) (NSIS for Windows, AppImage/`.deb` for Linux). CI/release pipeline lives in `.github/workflows/` and deploys this repo's `website/` to Firebase Hosting on every tagged release.

## License

MIT — see [`LICENSE`](LICENSE).
