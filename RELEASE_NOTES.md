<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → About as "What's new". Short bullets only — this comment is not shown.
-->

**Bug Fixes**
- **Fixed app not relaunching after quit:** Bloom's single-instance lock was not being released on quit, leaving a stale lock file that prevented the app from starting again until reboot. The lock is now explicitly released during shutdown.
- **Stale lock self-healing:** If a previous crash left a stale lock file behind, Bloom now detects the dead process and cleans up automatically instead of silently refusing to start.
- **Clean shutdown sequence:** Fixed a recursive quit loop between the overlay close handler and window-all-closed that could cause an unclean exit, contributing to the stale lock problem.
