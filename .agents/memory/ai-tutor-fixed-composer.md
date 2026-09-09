---
name: AI tutor fixed composer
description: Layout constraint for the student AI tutor chat on mobile.
---

The student-facing AI tutor is the `SmartTeacherScreen` route, not the support center's embedded AI panel. Its text mode must make the page shell non-scrolling, keep messages in their own `ScrollView`, and leave the composer as a sibling below that scroller.

**Why:** The shared `Screen` component reserves bottom space for tabs and its default `ScrollView` makes a composer move with the conversation. Applying a fixed-composer change to `SupportCenterScreen` does not affect the student tutor shown from `/smart-teacher`.

**How to apply:** Use the actual SmartTeacherScreen route for tutor UI changes; override the tab-reserved bottom padding in fixed text mode while retaining the device safe-area inset.