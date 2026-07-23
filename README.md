# Bloom 🌸

[![Build and Test](https://github.com/PraneethReddy-github/bloom/actions/workflows/build-test.yml/badge.svg)](https://github.com/PraneethReddy-github/bloom/actions/workflows/build-test.yml)
[![Release](https://github.com/PraneethReddy-github/bloom/actions/workflows/release.yml/badge.svg)](https://github.com/PraneethReddy-github/bloom/actions/workflows/release.yml)

*Everything, one bloom away.*

Bloom is a floating, draggable glass bud that lives on top of your desktop. Click it and it **blooms** into a circular menu of your actions — hover (or arrow-key onto) a folder and its ring blooms one layer further out, GTA-weapon-wheel style. Nest as deep as you like: past two rings, Bloom zooms and recenters with a breadcrumb trail back.

## Download & Install

Bloom is distributed as a single, self-contained application for Windows and Linux. All dependencies (including local AI models and Linux window management utilities) are fully bundled. It just works out of the box.

- **Windows**: Download the latest `.exe` installer from the [Releases](https://github.com/Praneethreddy-github/bloom/releases) page.
- **Linux**: Download the `.deb` or `.AppImage` from the [Releases](https://github.com/Praneethreddy-github/bloom/releases) page.

Updates are downloaded and installed automatically in the background.

## Features & Usage

Bloom consists of two main elements: the **bud** (the small floating icon) and the **ring** (the expanded menu).

### The Bud

| Input | Result |
|---|---|
| **Click** | Open the ring (click again or click the bud to pop one layer) |
| **Double-click** | Starts Voice Dictation by default, or fires your ★ favorite action |
| **Long-press** | Triggers Read-Aloud (TTS) by default, or fires your favorite action |
| **Drag** | Move it anywhere (edge-snaps; position persists) |
| **Scroll** | Cycle through pinned actions in a chip — click to run |
| **Middle-click**| Hide to tray |
| **Right-click** | Edit Actions · Settings · Pin position · Hide · Quit |
| **Drop a file** | Shows a mini-ring: Open · Open folder · Copy path |

### Built-in Voice AI (No Internet Required)

Bloom features powerful, fully local voice capabilities that run entirely on your device:

- **Voice Dictation (Speech-to-Text)**: Press `Ctrl+Alt+D` (or double-click the bud) to start talking. Bloom uses an embedded Whisper AI model (`Xenova/whisper-base.en`) to capture your voice, transcribe it, and instantly type it out wherever your cursor is.
- **Read-Aloud (Text-to-Speech)**: Highlight any text on your screen and press `Ctrl+Alt+R` (or long-press the bud). Bloom will instantly read the selected text aloud using your operating system's native TTS engine.

### Global Hotkeys

- `Ctrl+Alt+Space` summons the ring anywhere (at your cursor if the bud is hidden).
- `Ctrl+Shift+Space` opens the command palette — fuzzy-search every action regardless of depth.
- `Ctrl+Alt+D` toggles Voice Dictation.
- `Ctrl+Alt+R` triggers Read-Aloud for selected text.

*(All hotkeys are fully rebindable in Settings).*

### Inside the Ring

- Folders bloom a child ring outward while the parent stays visible and dims — you keep spatial context.
- Beyond two visible rings it recenters (zoom) with clickable breadcrumbs near the bud.
- Fully keyboard operable: `←/→` orbit, `Enter` dive/run, `Esc` back, `Home` root, `1–9` direct pick, `?` cheat sheet.

## Actions Supported

Bloom is incredibly powerful and customizable. You can configure it to trigger:
- **Folders & App launches**
- **URLs** (specific browser + profile, multi-URL tab groups)
- **Terminal profiles** (cwd + command + emulator choice)
- **System toggles** (screenshot, lock, dark mode, night light, volume, Wi-Fi, Bluetooth, DND, sleep/restart/shutdown)
- **Media keys & Snippets** (copy/paste)
- **Custom scripts** (`.sh/.py/.ps1/.bat`)
- **Webhooks** (GET/POST)
- **Linear macros** with delays

Failures never no-op silently: the node flashes red and a toast names the reason.

## Settings

Right-click the bud and select **Settings** to access the complete configuration interface:
- **Actions**: Manage your action tree with a searchable outline and a wizard (with "Run now" testing). Drag to reorder, merge into folders, star favorites, and pin actions.
- **Appearance**: Customize the flat opaque dial with live preview. Adjust accent color, backdrop dim, wedge size, dial radius, bud size, and more.
- **Hotkeys & Input**: Rebind global hotkeys and set per-action quick-fire hotkeys.
- **Profiles**: Snapshot and switch whole setups (tree + favorites + look).
