<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → About as "What's new". Short bullets only — this comment is not shown.
-->

**Improvements**
- **Bundled Offline Speech Model:** The Whisper speech-to-text model is now bundled directly with the application. Dictation will now work immediately on first use without requiring a background download or an internet connection.
- **Improved Wayland Paste Fallback:** If automatic pasting fails during dictation on Wayland, Bloom will now correctly surface the "Press Ctrl+V to paste" prompt instead of failing silently behind `xdotool`.

**Bug Fixes**
- **Fixed TTS and Text Selection on Wayland:** Bloom now natively reads the primary selection on Linux (both X11 and Wayland) for the Read-Aloud feature. This bypasses the need to simulate `Ctrl+C`, which fails on many Wayland compositors (like GNOME) that do not support virtual keyboard protocols.
- **Fixed app not starting after install:** `garden.js` was missing from the build files list, causing the packaged app to crash on startup with `Cannot find module './garden'`. The module is now included in the app bundle.
- **Fixed autostart without --no-sandbox:** The autostart desktop entry for packaged builds was missing `--no-sandbox`, causing silent crashes on security-focused Linux distros (e.g. Parrot OS). Both the autostart entry and packaged launch now include the flag.
- **Removed duplicate autostart registration:** An unconditional `app.setLoginItemSettings` call was creating a second autostart entry that conflicted with the manual one, potentially spawning duplicate instances on login.
