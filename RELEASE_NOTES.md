<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → About as "What's new". Short bullets only — this comment is not shown.
-->

**🌱 New Feature: Garden — LAN Collaboration**
- **Encrypted peer-to-peer messaging:** Chat with anyone running Bloom on your local network. All messages are end-to-end encrypted with X25519 key exchange — even other Bloom users on the same network cannot read conversations they are not part of.
- **Task delegation:** Send tasks to peers and assign them to Eisenhower matrix quadrants. Recipients can accept or decline, and you get notified when a task is marked done.
- **Shared matrix view:** Request a read-only view of a peer's Eisenhower board to see what they are working on.
- **Presence & identity:** Peers are discovered automatically via UDP broadcast. Choose a name and an animal avatar, or go anonymous — a stable face is derived from your peer ID either way.
- **Bud notifications:** Incoming messages and tasks surface as notification pills on the bud. Hover to peek, click to open the conversation. Notifications respect your DND setting.
- **Security verification:** A shared pair code lets two people confirm their connection is not intercepted — readable side by side, no need to exchange separate fingerprints.
- **Offline queue:** Messages and tasks sent while a peer is offline are queued and delivered automatically when they come back, with a 24-hour TTL.

**Features & Enhancements**
- **Garden settings tab:** New dedicated tab in Settings for managing your identity, peer list, conversations, and shared task boards.
- **Notification dwell:** Hover over the bud to read notification content without opening Settings.
- **Focus layout refinements:** Improved spacing and visual hierarchy in the Focus & Tasks panel.

**Bug Fixes**
- **Config recovery:** Automatic recovery and restore notifications for configuration files following unclean app shutdowns.
