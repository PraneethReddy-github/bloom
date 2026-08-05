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
- [Focus timer & task matrix](#focus-timer--task-matrix)
- [Actions Supported](#actions-supported)
- [Settings](#settings)
- [First run](#first-run)
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
| **Double-click** | Voice Dictation |
| **Long-press** | Read-Aloud (TTS) |
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

These four hotkeys are always on, and mirror the bud's own gestures — double-click dictates, long-press reads aloud (all rebindable in Settings, with conflict detection).

### Inside the Dial

- Opening a folder doesn't replace the dial — its contents open in a new ring just outside, while the ring you came from shrinks and dims (except the item on the path to what's open), so you keep your bearings.
- Fully keyboard operable: `←/→` orbit the open ring, `↑` opens a focused folder, `↓` steps back one layer, `Enter` selects, `Esc`/`Backspace` backs out, `Home` jumps to root, `0–9` jump directly to a slot, `?` shows the cheat sheet.

## Focus timer & task matrix

### The ring

Open the **Focus** folder in the dial and pick a block — `20 / 10`, `40 / 20`, `50 / 10`, or **Custom…** for your own minutes. The timer then draws itself as a ring in the space around the bud, depleting as the block runs down:

| State | Colour |
|---|---|
| **Focus** | green `#34D399` |
| **Break** | red `#E5484D` |
| **Paused** | grey `#6B7180` |

These three are fixed and identical in every profile — the ring never borrows your accent, so it always means the same thing.

**Hover the bud** while a timer runs and a small pill appears above it: a dot in the phase colour and the time left, nothing else. When the focus block ends the break starts on its own (switch that off in Settings).

### Sounds

Phase changes ring rather than announce themselves. Pick a tone for **when a focus block ends** and another for **when a break ends** — `Chime`, `Soft bell`, `Marimba`, `Blip`, `Gong`, `Silent`, or **Choose a file…** to point at your own `.mp3`/`.wav`/`.ogg`. There's a preview button on each and one volume slider. The built-in tones are synthesized in code, so no audio files ship with Bloom and nothing depends on a codec being installed.

Presets are ordinary actions, so a preset is edited exactly like anything else in your dial — in **Settings › Focus & Tasks**, or in the Actions tree, or by adding a new **Focus Timer** action anywhere you like. `Pause` and `Stop` nodes live in the same folder.

### The matrix

**Settings › Focus & Tasks** holds an Eisenhower board: four quadrants — *Do first*, *Schedule*, *Delegate*, *Eliminate*. Type into a quadrant to add a task, then move cards as reality changes — drag them, or use the ⇄ button on a card if you'd rather not. The circle on the left marks a task done, ⏱ starts a focus block **on that task** (its name then shows in the bud's hover pill), and delete offers an undo. The board is also one click from the dial via the **Tasks** node.

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

- **Actions**: manage your action tree with a searchable outline and a wizard (with "Run now" testing). Drag to reorder, merge into folders, and pin actions.
- **Appearance**: Bloom has one look — a flat, opaque dial. Tune its size, spacing, pacing and accent color, with a live preview.
- **Hotkeys & Input**: rebind the global hotkeys and set per-action quick-fire ones. A combination another app already owns is flagged rather than silently doing nothing.
- **Focus & Tasks**: the running timer, its presets and behaviour, and the Eisenhower board.
- **Profiles**: snapshot and switch whole setups (tree + pins), or start over from one of four templates. Your accent is *not* part of a profile — set it once in Appearance and every profile follows.
- **About & Updates**: check for a new version — **what changed is listed right there under the button**, not in a popup, and collapses to a single line when you're done with it. Already up to date? It shows what the version you're running brought instead of nothing at all.

Config is a single JSON file (`%APPDATA%/Bloom/config.json` on Windows, `~/.config/bloom/config.json` on Linux), written atomically with rolling backups — export/import it to back up or move your setup between machines.

## First run

The welcome cards end with two questions — what your day mostly looks like, and how long you like to work — and Bloom starts you on the matching setup instead of a generic one:

| Template | For | Ships with |
|---|---|---|
| **Maker** | Developers, designers, anyone who builds | Editor, terminals, localhost, docs, long focus blocks |
| **Coordinator** | Managers, founders, people-shaped days | Mail, calendar, meet, a start-my-day macro, snippets |
| **Explorer** | Students, writers, creators, everyday desktops | Notes, drive, media keys, study sprints |

All three land in **Settings › Profiles** regardless of which you pick, so switching later is one click and nothing is lost — your current setup is always snapshotted under its own name first. Skipping the questions leaves the stock setup untouched.

Templates change your actions and pins, never your look: a profile has no colour of its own, exactly like a profile you create yourself.

The first time the Settings window opens, a short guided tour spotlights each section and says what lives there. Replay it any time from **About › Take the tour**.

Upgrading from an earlier version? Your tree is left alone apart from a one-time addition of the **Focus** folder and **Tasks** node — delete them and they stay deleted.

## Tech stack

Bloom is an [Electron](https://www.electronjs.org/) app — plain HTML/CSS/vanilla JS in the renderer, no framework or build step. `npm test` runs the config checks (templates, migrations, merge semantics). Packaged with [electron-builder](https://www.electron.build/) (NSIS for Windows, AppImage/`.deb` for Linux). CI/release pipeline lives in `.github/workflows/` and deploys this repo's `website/` to Firebase Hosting on every tagged release.

## License

MIT — see [`LICENSE`](LICENSE).
