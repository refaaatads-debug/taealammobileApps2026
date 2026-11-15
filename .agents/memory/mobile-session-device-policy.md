---
name: Mobile session completion policy
description: Both booking participants may end an active online session without taking billing authority from the platform trigger.
---

Either booking participant may explicitly end an active online session. The mobile app must send the existing `session-end` signal over the Agora data channel; the platform teacher handles the authoritative database transition and the existing trigger settles billing. Leaving the room or navigating back only disconnects that device; it must not end the shared lesson.

**Why:** The user confirmed this behavior already existed. A mobile refactor removed the Agora end signal and replaced it with local room exit, which caused the regression. Student table updates are blocked by RLS, and billing is trigger-driven.

**How to apply:** Preserve the Agora `session-end` protocol and wait for the platform's Realtime/database confirmation before closing the mobile room. Do not add a separate end-session API or direct client-side billing updates. Keep back/leave navigation local and preserve the in-person lifecycle.