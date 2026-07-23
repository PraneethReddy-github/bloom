# Bloom — Build Specification

> A floating, layered, glass quick-action launcher for Windows & Linux — AssistiveTouch's floating button crossed with GTA V's weapon wheel.

**How to use this document:** This is a complete build brief. Paste it in full to your coding agent. Read the whole thing before writing any code — later sections (Known Hard Problems, Build Phases, Acceptance Criteria) change how earlier sections should be implemented. Build in the phased order given in Section 13; do not attempt every feature in one pass. Where a default is given, treat it as a starting value the user can reconfigure, not a hard requirement.

---

## 0. Elevator Pitch

Build **Bloom**: a small, draggable, always-on-top glass orb that lives on top of everything on a Windows or Linux desktop. Click it and it blooms into a circular menu of user-defined actions — launch an app, open a URL in a specific browser, drop into a saved terminal profile, toggle a system setting, run a multi-step macro. Selecting a category doesn't just run an action — it can open its own nested ring of sub-options one layer out, exactly like drilling from a weapon category into its attachments in GTA V's wheel. Everything is user-configurable: what's in each ring, how deep the nesting goes, what each node looks like, and how the whole thing is configured in the first place. The orb never steals screen space or clicks when it isn't actively being used, is fully operable from the keyboard, and is themed as frosted, translucent glass throughout.

---

## 1. Name & Identity

**Name: Bloom** — the ring menu literally blooms outward from the orb (see Section 3), so the name describes the app's own signature motion instead of a generic tech buzzword. Short, warm, and easy to say out loud for a tool you'll be opening dozens of times a day.

Alternates considered: **Petal** (same blooming idea, softer) and **Glint** (leans harder into the glass/light look instead of the motion).

Tagline: *"Everything, one bloom away."*

---

## 2. The Orb — States & Interactions

The orb is the single persistent visual element. Everything else (the ring menu) is transient and only exists while summoned.

| Input | Behavior |
|---|---|
| **Idle** | Sits at ~55% opacity, default 56px diameter, gentle "breathing" animation (2–3% scale pulse every ~4s) so it reads as alive, not dead pixels. |
| **Hover** | Scales to 1.08×, opacity rises to ~85%, glass blur and glow intensify. Optional tooltip shows the bound favorite action after ~600ms. |
| **Single click** | Opens the root ring (Layer 0), centered on the orb. |
| **Double click** | Fires the user's designated **favorite action** instantly — no menu. This is the fast path for the single most-used action (the "flashlight" of this tool). |
| **Right click** | Opens a small flat context menu: Edit Actions, Settings, Pin/Unpin Position, Hide to Tray, Quit. |
| **Click + drag** | Repositions the orb anywhere on screen, including across monitors. Releases with optional edge-snap. |
| **Long press (~400ms)** | Configurable alternate trigger — bound to whichever of "open menu" / "favorite action" isn't already on single-click. |
| **Scroll over orb** | Quick-cycles through pinned favorite actions without opening the full ring; release to execute, or click to confirm. |
| **Middle click** | Default: toggle orb visibility (minimize to tray). Reconfigurable. |
| **Drag a file over the orb** | Orb highlights to show it will accept the drop; releasing opens a small ring of file-aware actions instead of the default root ring (e.g. "Open with…", "Attach to new email," "Copy path," or any action the user has configured for file drops). |

Position, per-monitor placement, opacity, size, and every hotkey/gesture binding above must be user-adjustable in Settings (Section 7) — these defaults exist so the agent building this has concrete starting values, not so they're fixed.

---

## 3. The Layered Ring Menu

This is the core mechanic and the part most inspired by GTA V's weapon wheel: selecting a category doesn't just pick something, it can **open its own ring one layer further out**, which can itself contain categories that open another ring, and so on.

### 3.1 Structure

- **Layer 0 (root ring):** blooms directly around the orb on click. Default radius 130px from orb center. Contains top-level categories (e.g. Apps, Browser, Terminal, System, Macros, Favorites) and/or direct leaf actions.
- **Layer 1:** if a Layer 0 node is a *folder* (category), selecting it grows a second concentric ring further out (~240px radius) rather than replacing Layer 0 — both rings stay visible with a visual connector, so the user keeps spatial context of where they are, exactly like the weapon wheel keeping the category ring visible while you pick a variant.
- **Layer 2+:** growing rings outward indefinitely would run off-screen, so beyond two concentric rings, transition to a **zoom/recenter**: the selected ring animates into becoming the new center-anchored ring, with a breadcrumb trail (e.g. `Apps > Browser > Tabs`) rendered near the orb showing the path back. This keeps nesting effectively unlimited without ever exceeding screen bounds.
- **Back navigation:** always available three ways — click the orb itself, press `Escape`/`Backspace`, or select a dedicated "back" node present at a fixed angle (e.g. straight down) in every non-root ring. Any of these pops one layer; they never close the whole menu unless already at root.
- **Dismiss:** click anywhere outside the rings (the click-through background), press `Escape` at root, or select a leaf action (auto-closes with a brief success flash/checkmark).

### 3.2 Node layout & hit-testing

Arrange nodes as icons evenly spaced around each ring (visually "orbital," matching the name) — **but** give each node an invisible pie-slice-shaped hit region reaching from the inner to outer radius of its ring, not just a small circular hitbox around the icon. This gets the best of both worlds: it looks like a clean ring of floating glass icons, but selection is as forgiving as GTA's wedge-shaped weapon-wheel segments, which matters a lot for fast mouse flicks and keyboard/number-key selection alike.

- Soft cap of 8 nodes per ring before the editor nudges the user to group items into a sub-folder; hard cap 12.
- If the orb sits near a screen edge or corner, do not render a ring that would extend off-screen — collapse it to a partial arc (semicircle on an edge, quarter-circle in a corner) spanning only the available angular space, keeping every node fully visible and reachable.

### 3.3 Example drill-down path

```
Orb click
 └─ Layer 0: Apps · Browser · Terminal · System · Macros · Favorites
                 └─ select "Browser" → Layer 1 blooms outward
                     └─ Chrome · Firefox · "Work Tabs" · "New Tab"
                             └─ select "Work Tabs" → executes: opens Gmail + Calendar
                                 in Chrome under the "Work" profile, ring closes
```

### 3.4 Command Palette (search-based alternate access)

The ring is great for muscle-memory browsing but bad for recalling one rarely-used action buried four layers deep. Its own global hotkey (default `Ctrl+Shift+Space`, rebindable, distinct from the ring-summon hotkey in Section 8) opens a single centered glass search box, styled with the same tokens as the ring:

- Fuzzy-searches every leaf action's label across the entire tree regardless of nesting depth, showing each match with its full breadcrumb (e.g. "Work Tabs — Apps > Browser").
- Arrow keys + `Enter` to execute, `Escape` to dismiss — same navigation language as the ring itself.
- This is the second of two ways to reach any action: browse spatially via the ring, or search directly via the palette.

---

## 4. Action Types Catalog

Every node is either a **folder** (opens a child ring, no direct effect) or one of the following **leaf action types**. This list is the "everything we can put into it" answer — treat category 12 (Custom Script / Webhook) as the escape hatch for anything not explicitly listed, so the action system never needs a hardcoded case for every possible integration.

1. **Launch Application** — searchable picker over installed apps (Start Menu / `.desktop` files). Optional launch arguments. Toggle: launch new instance vs. focus existing window if already running.
2. **Open URL / Website** — opens in a chosen browser (system default, or explicitly Chrome/Firefox/Edge/Brave/etc.), in a specific profile, as new tab or new window. Can hold a *list* of URLs to open at once (a "tab group" macro — e.g. "Work Tabs" opens five URLs together).
3. **Restore Tab Group / Session** — a saved set of URLs treated as a reusable group (as above). True "jump to an already-open tab" requires a small companion browser extension talking back to the app — flag this as an optional Phase-2+ stretch feature, not core, since it can't be done reliably from outside the browser process alone.
4. **Terminal / Shell Profile** — opens a terminal (user's default, or explicitly Windows Terminal/PowerShell/CMD/WSL/GNOME Terminal/Konsole/Alacritty/kitty/etc.) with a specific working directory and an optional command to auto-run. This is the "Terminal" category the user can expand into a sub-ring of saved profiles (e.g. "Project A" → cd + `npm run dev`; "SSH prod" → an ssh command). Support an explicit run-as-admin/sudo toggle that always shows a confirmation dialog before firing (see Section 11).
5. **Macro / Action Chain** — a linear sequence of the other action types with optional delay/wait steps between them (e.g. "Start My Day": launch Outlook → wait 1.5s → open three tabs in Chrome → set volume to 40%). Keep macros linear; branching/conditional logic is a plausible v2 idea, not core.
6. **System Toggle** — the desktop equivalents of "turn on flashlight": Wi-Fi on/off, Bluetooth on/off, Do-Not-Disturb/Focus, dark/light theme, display brightness, volume/mute, mic mute, screen lock, sleep/restart/shutdown (destructive ones always confirm), screenshot (region/window/full, auto-copy or auto-save), clipboard history, always-on-top for the focused window, night light, external display mode, screen recording start/stop.
7. **Window Management** — snap focused window (halves/quadrants/maximize/minimize), show desktop, cycle windows of one app, move focused window to another monitor, save/restore a named window layout.
8. **Media Controls** — play/pause/next/prev/volume, via OS media-key simulation so it controls whatever has the active media session.
9. **Text Snippet / Clipboard** — insert predefined text at the cursor, copy predefined text, or open a "recent clipboard items" sub-ring to quick-paste from.
10. **Open File / Folder** — quick-open a specific path, or a dynamic "recent files" ring.
11. **Custom Script / Webhook** — run a user-authored script (`.sh` / `.py` / `.ps1` / `.bat`) or call a URL (HTTP GET/POST — useful for home automation, Home Assistant, IFTTT/Zapier). This is the generalized escape hatch covering anything sections 1–10 didn't anticipate.
12. **Dynamic/Live Node** — a node whose face shows live data instead of a static icon (current volume, next calendar event, unread mail count, CPU/RAM, a running timer) and executes an action on click (e.g. opens the calendar app). Not core to v1 — nice Phase 5 polish.
13. **Folder** — not an action; a container that opens a child ring. This is the recursive nesting mechanism from Section 3.

---

## 5. Customization System & Edit Mode

- **Edit Mode** toggled from the right-click context menu or a persistent gear node in the root ring. While active: drag to reorder nodes, click an existing node to edit/duplicate/delete it, click a `+` placeholder to add one via a short wizard (pick action type → type-specific parameter form → icon/label/color → save), and drag one node onto another to merge them into a new folder (same interaction as creating an iOS home-screen folder).
- **Favorite & pinned actions:** any node can be starred, either from Edit Mode or the Settings Actions tab (Section 7.1). Exactly one starred node is "the favorite," bound to the double-click/long-press behavior in Section 2; any number of additional nodes can be "pinned," feeding the scroll-cycle behavior in the same table.
- **Enable/disable:** any node can be toggled off without deleting it — it greys out, stays in the config untouched, and is skipped by the ring, the command palette (3.4), and quick-fire hotkeys until re-enabled.
- **Test action:** the edit wizard includes a "Run now" button so a new or edited action can be verified immediately, before the user ever relies on it live from the ring.
- **Undo:** deleting a node or folder shows a brief "Undone" toast (Section 7.3) with an Undo action for a few seconds before the change is final — a safety net for the one destructive edit that's easy to fire by accident, not a full multi-step undo history.
- **Icon picker:** bundled outline icon set, custom image upload, emoji, auto-fetched favicon for URLs, auto-extracted icon for installed apps.
- **Import/export:** the whole configuration is one JSON file — for backup, syncing between machines, and sharing "recipes" with other users. Example shape:

```json
{
  "version": 1,
  "root": {
    "id": "root",
    "type": "folder",
    "children": [
      {
        "id": "apps",
        "type": "folder",
        "label": "Apps",
        "icon": "grid",
        "children": [
          { "id": "outlook", "type": "launch_app", "label": "Outlook",
            "icon": "auto", "params": { "path": "outlook.exe", "focusIfRunning": true } },
          { "id": "chrome-work", "type": "open_url", "label": "Work Tabs",
            "icon": "chrome",
            "params": { "urls": ["https://mail.google.com", "https://calendar.google.com"],
                        "browser": "chrome", "profile": "Work" } }
        ]
      },
      {
        "id": "terminal",
        "type": "folder",
        "label": "Terminal",
        "icon": "terminal",
        "children": [
          { "id": "proj-a", "type": "run_command", "label": "Project A Dev",
            "params": { "cwd": "~/projects/a", "command": "npm run dev", "terminal": "default" } }
        ]
      },
      { "id": "night-light", "type": "system_toggle", "label": "Night Light",
        "params": { "toggle": "night_light" } },
      { "id": "start-my-day", "type": "macro", "label": "Start My Day",
        "params": { "steps": [
          { "action": "launch_app", "path": "outlook.exe" },
          { "action": "wait", "ms": 1500 },
          { "action": "open_url", "urls": ["https://slack.com"], "browser": "default" }
        ] } }
    ]
  }
}
```

Each node additionally carries `enabled`, `favorite`, and `pinned` boolean fields (omitted above for brevity) backing the bullets earlier in this section.

- **Profiles:** multiple named configurations the user can switch between (e.g. "Work" vs. "Gaming" vs. "Presentation" with a stripped-down root ring). Auto-switching by active app or time of day is a plausible later feature, not core.

---

## 6. Visual Design System

Dark-mode-first (glass reads best over a dark base) with full light-mode and OS-theme-following support. This section covers both the shipped default look (6.1) and the settings that let a user retune all of it (6.2–6.4) — the "how glassy/frosty, how do the icons look" answer lives here.

### 6.1 Default Look

- **Orb glass:** `background: rgba(255,255,255,0.12)`, `backdrop-filter: blur(20px) saturate(180%)`, `border: 1px solid rgba(255,255,255,0.3)`, soft outer glow in the accent color. Hover pushes blur to 24px and lifts tint opacity to ~0.18.
- **Ring nodes:** 52px glass capsules, same blur family as the orb, with hover (brighten + scale) and active/selected (glow ring + click ripple) states, and a greyed/disabled state when a target is unavailable (app not installed, offline, etc.).
- **Noise grain:** blend a subtle (~3–5% opacity) fractal-noise texture over glass surfaces — plain CSS/backdrop blur alone tends to band and look flat/cheap; a faint grain fixes that.
- **Accent:** default a cyan-to-violet gradient (`#5EEAD4` → `#A78BFA`).
- **Motion:** rings bloom in with a staggered scale+fade spring (~220ms, ~15ms stagger per node, slight overshoot easing) so they cascade outward rather than popping in at once.
- **Sound:** optional, off by default — a soft open/select/back tick.
- **Multi-monitor & DPI:** the orb is per-monitor-position-aware and must render crisply at each monitor's own DPI/scale factor — no naive upscaling blur.

### 6.2 Appearance Settings (user-adjustable, with live preview)

Every value in 6.1 is a starting point, not a fixed constant. Expose a Settings → Appearance panel (Section 7.2) where every control updates a live preview of the actual orb/ring, not just numbers on a slider:

- **Glass intensity presets** — Clear / Frosted / Opaque / Flat, where Flat swaps real-time blur for a solid tinted panel entirely (see 6.4). Below the presets, manual sliders for blur radius (0–40px), tint opacity (0–50%), saturation/vibrancy (100–200%), and border glow intensity — independently for idle vs. hover state.
- **Orb shape & size** — diameter slider, corner style (perfect circle vs. squircle), border thickness.
- **Ring & node styling** — node shape (circle / capsule / hexagon / squircle), node size, ring spacing/radius, label mode (icon-only / icon + label / label-only), corner roundness, select/hover glow color.
- **Per-category accent overrides** — let one category (e.g. "Terminal") carry its own tint distinct from the global accent, so categories read at a glance without reading labels.
- **Motion speed** — a multiplier on top of the reduce-motion accessibility cutoff from Section 8, so animation can be snappier or slower to taste, not just on/off.
- **Theme presets** — ship a few named starting points ("Midnight Glass," "Frosted Light," "Neon Glass," "Minimal Flat"); any tuned combination can be saved as a custom named preset. Presets live in the same JSON config as actions (Section 5), so they export/import/share the same way.
- **Wallpaper-adaptive accent (optional "Auto" mode)** — sample the desktop wallpaper's dominant color for the accent automatically, refreshing when the wallpaper changes.

### 6.3 Icon Appearance

Builds on the icon *picker* in Section 5 (where an icon comes from) — this is how it's rendered:

- Icon style applied consistently across the bundled set: outline / filled / duotone.
- Per-icon or per-category color override, independent of an auto-extracted app icon or fetched favicon.
- Monochrome mode (recolor every icon to the current accent for a uniform look) vs. full-color mode (keep each app/site's native icon colors).
- Optional small status badge on a node (e.g. an unread count or live value) for the Dynamic/Live Node action type from Section 4.

### 6.4 Performance & Accessibility Fallback

- Real-time backdrop blur costs real GPU time. On lower-end/integrated graphics, the **Flat** preset from 6.2 swaps blur for a solid tinted panel with identical layout, so the tool stays smooth without relying on real-time blur.
- **Reduced-transparency mode**, independent of reduced-motion: raises minimum tint opacity and disables blur regardless of the chosen preset, for users who need firmer contrast/readability.

---

## 7. Settings Panel & Product Feel

Sections 4–6 define what can be configured and how it all looks. This section defines the dedicated surface where a user actually goes to configure it, and the moments where Bloom talks back to the user outside of the ring itself.

### 7.1 Layout & Navigation

- A separate, resizable window — not the transient ring overlay. Opened from the orb's right-click menu, a gear node in the root ring, or the tray/indicator icon. Behaves like a normal application window: standard OS chrome (minimize/maximize/close), its own taskbar entry while open, not forced always-on-top.
- Two-pane layout: a left navigation rail with fixed sections — **Actions**, **Appearance**, **Hotkeys & Input**, **Profiles**, **General & Startup**, **About & Updates** — with the selected section's content on the right.
- The **Actions** tab shows the entire ring tree as a flat, searchable, indentable outline — not just the radial widget — because editing a node four layers deep purely through the radial UI is slow. Drag to reorder or reparent directly in the list; a search box at the top filters the tree live as you type.
- A global search box lives in the panel's title bar, not just inside the Actions tab — it searches actions, settings, and hotkey bindings together and jumps straight to the matching control.
- Remembers window size, position, and last-open tab between launches.
- Fully keyboard-navigable and screen-reader-friendly, unlike the deliberately gestural ring — this is a conventional productivity surface, so it follows conventional accessibility patterns.

### 7.2 Visual Style

- Same accent/token system as Section 6, so it reads as the same product, but content areas (lists, forms, text) sit on a more opaque, higher-contrast surface than the transient ring — this is a dense, read-and-edit surface, not a fleeting overlay, so legibility wins over glass intensity here. Glass treatment is reserved for chrome: the window's title bar and the left navigation rail.
- The **Appearance** tab docks a small live-rendered orb + ring preview (Section 6.2) permanently in view — every slider updates it instantly; it never requires opening the real ring to see a change take effect.

### 7.3 Feedback, Errors & Notifications

- A consistent toast style (same glass tokens, anchored near the orb, auto-dismissing) reports: an action executed, a config import succeeded/failed, a hotkey conflict was detected, an update is available.
- **Runtime failures** (app path missing, no network, script exited non-zero, permission denied) surface as a brief warning glow on the node itself plus a toast naming the actual reason — never a silent no-op. This is distinct from the greyed "unavailable" state in 6.1, which is known in advance; this is a failure at the moment of execution.
- **Crash recovery:** if Bloom has to fall back to a rolling config backup (Section 9's atomic-write safety net) after an unclean shutdown, it says so once via toast on next launch, rather than silently substituting an older config.
- **Updates:** a small badge on the tray icon and an entry in About & Updates when a new version is available; never a forced or silent auto-update.

### 7.4 First-Run Onboarding

- On first launch only, a short skippable walkthrough covering the orb (Section 2), the ring (Section 3), how to add an action, and the global hotkey and command palette (3.4). A persisted "seen" flag means it never appears again after completion or skip; replayable later from About & Updates.
- Ships with a small set of harmless example actions pre-populated (e.g. open a "Welcome" page, a system toggle or two) so the first ring the user ever opens isn't empty — an empty root ring on first launch is a dead end, not an invitation to explore.

---

## 8. Keyboard, Hotkeys & Accessibility

- **Global hotkey** (default suggestion `Ctrl+Alt+Space`, must be rebindable — global hotkeys collide with other running software constantly) summons the root ring from anywhere, even if the orb is hidden to tray, centered on the current cursor position or the primary monitor.
- **Full keyboard navigation once open:** arrow keys (or Tab/Shift+Tab) cycle focus around the current ring, `Enter`/`Space` selects or drills in, `Escape`/`Backspace` goes back one layer, `Home` jumps straight to the root ring, and number keys `1`–`9`/`0` directly select the first ten nodes of the open ring (shown as small badges) for fast power-user access without touching a mouse at all.
- **Per-action quick-fire hotkeys:** let the user assign a direct global hotkey to their 5–10 most-used individual actions, bypassing the ring entirely.
- **Hotkey conflict detection:** whenever a new global hotkey is assigned — ring-summon, command palette, or a per-action quick-fire binding — Bloom checks it against its own existing bindings and blocks/warns on a collision before saving. It cannot see every other application's bindings on the system, so firing it once is still the ultimate test, but two Bloom actions can never silently share one hotkey.
- **Shortcut cheat-sheet:** pressing `?` while any ring is open overlays the currently active keyboard bindings, so new users aren't required to memorize them.
- **Accessibility:** visible focus indicators throughout, resizable hit targets, high-contrast theme option, and the reduce-motion setting from Section 6. Every feature must be reachable without a mouse.

---

## 9. Window & OS Behavior Requirements

- **Never blocks the screen:** the orb's own hit-region is always interactive, but the rest of the overlay window (used only to render the rings when open) is click-through in every transparent area, so clicks meant for whatever's underneath always reach it when the menu isn't open.
- **Always-on-top**, but auto-hide or fade to low opacity when a real fullscreen-exclusive app (a game, a video player) has focus — configurable.
- **Draggable anywhere**, including across multiple monitors; remembers position per monitor configuration; optional edge-snap and edge auto-hide/peek.
- **Background/tray app:** system tray icon (Windows) / app indicator (Linux) with show/hide, edit mode, and quit; launch-on-startup option; no taskbar entry by default (configurable); must stay lightweight — this runs all the time, so idle CPU/RAM footprint matters.
- **Config storage:** a single JSON file in the OS app-data directory (`%APPDATA%\Bloom\config.json` / `~/.config/bloom/config.json`), written atomically with a rolling backup (keep last 5) so a crash mid-write can't corrupt the user's whole action tree.

---

## 10. Technical Architecture — Recommendation

**Recommended stack: Tauri (Rust core) + a web front-end (React or Svelte + TypeScript).** Reasoning: a single codebase targets both Windows and Linux, the binary and idle memory footprint stay small (this runs permanently in the background, so that matters more than usual), and the plugin ecosystem covers nearly every OS hook this spec needs out of the box: `tauri-plugin-global-shortcut` for hotkeys, `tauri-plugin-autostart` for launch-on-login, the built-in tray API, and `set_ignore_cursor_events` for the click-through overlay behavior in Section 9. Render the rings with plain CSS/SVG positioning (simple trigonometry — `position = center + radius * cos/sin(angle)`) animated with a spring library (e.g. Framer Motion if using React). The Settings Panel (Section 7) is a second window/route within this same app, reading and writing the same live config store as the orb/ring — not a separate process.

**Alternative: Electron.** Heavier and more RAM-hungry, but it bundles Chromium, so `backdrop-filter` blur renders pixel-identically on both Windows and Linux with zero platform-specific fallback work — genuinely worth it if the glass look turns out to be more fragile under Tauri's Linux webview than expected (see below). Equivalents: `globalShortcut`, `Tray`, `setIgnoreMouseEvents`, packaged via `electron-builder` (NSIS for Windows, AppImage/deb for Linux).

**Alternative: native Qt (C++ or PySide6).** True native performance and OS integration, single codebase across both targets, but the glass/blur effect needs to be hand-rendered (no `backdrop-filter` equivalent) and the radial menu needs custom painting instead of CSS. Pick this only if minimizing runtime footprint matters more than development speed.

### Known hard problems — read before committing to a stack

- **Wayland vs. X11.** Most current Linux distros default to Wayland, whose security model deliberately restricts exactly the things this app needs: global hotkey listening and arbitrary window manipulation (snapping, focusing other apps' windows) are far more restricted than on X11. Expect to need an X11 fallback path (`wmctrl`/`xdotool`) and to gracefully degrade window-management features on Wayland compositors that don't expose an equivalent portal API.
- **WebKitGTK's `backdrop-filter` support (Tauri on Linux only)** has historically been inconsistent across distro-shipped WebKitGTK versions, unlike Chromium (Electron, or Tauri on Windows via WebView2). If real blur doesn't render reliably, fall back to a **software-rendered frost**: composite a captured screenshot of what's behind the window, blur it in-app, and tint it, so the look is guaranteed identical everywhere regardless of compositor support.
- **System-toggle fragmentation across Linux desktop environments.** There is no single API for Wi-Fi/Bluetooth/brightness/media-key control across GNOME/KDE/XFCE/etc. Prefer DBus where available (most portable common denominator); otherwise shell out to `nmcli` (Wi-Fi), `bluetoothctl` (Bluetooth), `brightnessctl` (brightness), `playerctl` (media keys). Detect what's actually available on the running DE and hide toggles that aren't supported rather than showing a broken control.
- **Tab-level browser control** (jump to an already-open tab, not just open a new one) needs a companion browser extension talking back to the app over a local socket — flag this to the user as an optional add-on, not something the base app can do alone.

---

## 11. Security & Safety Notes

- Any action that elevates privileges (sudo/run-as-admin) or is destructive (shutdown, restart, delete) must show an explicit confirmation dialog before firing — no silent execution.
- Scripts and commands are stored as plain, user-editable text the user can audit at any time — never obfuscated, never fetched and executed from a remote source without the user seeing the exact command first.
- The app never elevates its own privileges to run an action; everything executes at the user's existing permission level.
- Config file lives under the user's own profile with normal user-level file permissions — no world-writable config.
- Webhook/URL actions should surface the exact target URL in the editor and before firing, so nothing fires blind.

---

## 12. Non-Goals (v1 scope boundaries)

- No mobile app — desktop only (Windows + Linux), as requested.
- No cloud sync or account system — local config plus JSON import/export covers backup and sharing. Possible v2.
- No AI-driven "smart suggestions" — a fun idea for later, not core.
- No mandatory telemetry or analytics.

---

## 13. Suggested Build Phases

1. **Skeleton** — transparent, always-on-top, draggable orb window; click-through everywhere else; tray icon; global hotkey opens/closes a placeholder circle.
2. **Ring core** — root ring with a few hardcoded demo actions; hover/click/keyboard navigation; open/close animation; one level of drill-down with back navigation.
3. **Action engine** — implement the action types from Section 4 for real (launch app, open URL, run terminal command, system toggle, macro), with real OS execution behind them.
4. **Customization UI** — the dedicated Settings Panel (Section 7) with the Actions tree, Appearance tab with live preview, edit wizard (add/reorder/delete/enable-disable/test/undo), JSON import/export, and first-run onboarding; plus the command palette (Section 3.4) as an alternate search-based way to reach the same action tree.
5. **Glass & polish** — real blur/frost rendering (plus the Linux fallback from Section 10 if needed), theming, motion, optional sound, the toast/feedback system (7.3), and hotkey-conflict detection (Section 8).
6. **Packaging** — Windows installer, Linux AppImage/.deb, autostart wiring, (stretch) auto-update.

---

## 14. Acceptance Criteria

- [ ] Orb is draggable anywhere on screen, on any connected monitor, and remembers its position after restart.
- [ ] When the ring menu is closed, nothing the app renders intercepts a click or blocks the view of whatever is underneath, except the orb's own hit-region.
- [ ] Root ring opens on click, centered on the orb, within one animation frame budget (~250ms) of input.
- [ ] Selecting a folder node opens a child ring one layer out (or zooms/recenters past two layers) without ever rendering off-screen, including at screen edges/corners.
- [ ] Every ring is fully navigable and selectable via keyboard alone, with no mouse.
- [ ] The global hotkey opens the menu from any application, including when the orb is hidden to tray.
- [ ] At least one action from each of the categories in Section 4 (app launch, URL, terminal profile, system toggle, macro) works end-to-end on both a Windows and a Linux target.
- [ ] A user can add, edit, delete, and reorder actions entirely through the UI, with no config file editing required.
- [ ] Every appearance setting (glass intensity, orb/node shape and size, icon style, theme preset) is adjustable from Settings with a live preview, with no config file editing required.
- [ ] The Settings Panel opens as its own window, matches the layout in Section 7.1, and every control in it (Actions tree, Appearance sliders, Hotkeys, Profiles) works without ever needing to open the radial ring.
- [ ] The command palette finds and executes any leaf action by name regardless of nesting depth, via its own hotkey.
- [ ] A user can mark exactly one favorite and any number of pinned actions, and both drive the double-click/long-press and scroll-cycle behaviors from Section 2.
- [ ] Deleting a node shows an undo option before the change is final.
- [ ] A failed action (missing app, no network, non-zero script exit) always produces a visible toast naming the reason — never a silent no-op.
- [ ] First launch shows the onboarding walkthrough exactly once, with a non-empty example ring to explore.
- [ ] Assigning a hotkey that collides with another Bloom binding is caught and flagged before it's saved.
- [ ] Config exports to JSON and re-imports cleanly on a second machine.
- [ ] Destructive/elevated actions always show a confirmation dialog first.
- [ ] Idle CPU and RAM usage stay low enough that running it permanently in the background is unnoticeable.
