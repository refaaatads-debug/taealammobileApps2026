---
name: Expo web Preview host
description: The host mode required for a stable Expo Web app inside Replit's remote Simulate on Web Preview
---

Expo Web can render successfully while still reloading periodically when its dev server is started with `--localhost` behind Replit's remote Preview. The Preview iframe needs the dev server advertised in LAN mode so its development connection remains reachable.

**Why:** With localhost mode, the app loaded initially but the remote mobile-shaped Preview repeatedly cleared the screen and started the web application again. Switching only the Expo host mode to LAN stopped new `Running application "main"` starts during a sustained observation window.

**How to apply:** For the managed Expo Web workflow, use the LAN host mode with the fixed artifact port. Keep Metro's watch folders constrained separately to avoid inotify exhaustion; do not replace this with an external Expo Go or QR flow.