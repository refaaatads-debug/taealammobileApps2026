---
name: Auth loading layout
description: Layout rule for the mobile authentication bootstrap state
---

The authentication form and the authentication bootstrap/loading state must not share alignment styles. The form needs a full-width, stretchable parent for the hero and sheet; the loading state needs its own centered container.

**Why:** Removing centering from the shared auth container fixed side gutters but made the post-login skeleton render in the top-left corner, making a loading state look like a broken blank screen.

**How to apply:** Keep full-width layout rules on the form container and use a dedicated centered loading style. Always pair bootstrap loading with a visible timeout/error state so network or profile failures cannot leave an indefinite skeleton.