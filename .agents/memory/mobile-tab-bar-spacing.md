---
name: Mobile tab bar spacing
description: Safe-area and fixed bottom tab-bar layout rules for mobile screens.
---

Screens rendered under the custom absolute tab bar must preserve the bottom padding supplied by the shared `Screen` component. Nested screens should not replace it with a small local inset, especially when they contain fixed composers or action bars.

**Why:** The tab bar is positioned absolutely and does not consume normal layout space. Overriding the shared bottom padding makes the last interactive controls render underneath it.

**How to apply:** Keep the shared screen bottom inset for non-scrolling tab pages; if a screen needs custom spacing, add to the reserved inset rather than replacing it.