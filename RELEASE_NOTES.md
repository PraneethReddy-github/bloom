<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → About as "What's new". Short bullets only — this comment is not shown.
-->

**Bug Fixes**
- **Fixed TTS and STT on Wayland (for real this time):** The v2.0.2 Read-Aloud and Dictation fixes didn't actually work because `wtype` fails on compositors (KDE Plasma, GNOME) that don't expose the `zwp_virtual_keyboard_v1` protocol, and the only fallback was removed. This release replaces the single-tool strategy with a **wtype → ydotool → xdotool cascade** that tries every available input tool in order.
- **Fixed selection reading on native Wayland apps:** Bloom now reads the native Wayland primary selection via `wl-paste --primary` when Electron's XWayland clipboard bridge returns empty. This fixes Read-Aloud failing to grab highlighted text in Firefox, Kate, and other Wayland-native apps.
- **Fixed dictation clipboard on Wayland:** Dictation transcripts are now also written to the Wayland clipboard via `wl-copy`, ensuring manual Ctrl+V always works even when automated paste fails.
- **Fixed misleading error messages:** The "Install xdotool or wtype" toast (shown even when both were installed) is replaced with an accurate message.
