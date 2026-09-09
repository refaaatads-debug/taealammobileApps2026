---
name: Web native video style
description: Raw HTML video elements in the Expo web surface cannot receive React Native style arrays.
---

When rendering a raw `video` element on Expo web, pass a plain CSS style object. React Native style arrays are valid for React Native components but can make the browser attempt to set indexed CSS properties and throw `Failed to set an indexed property`.

**Why:** The session room's web preview crashed immediately when a native style array was passed through `React.createElement('video')`.

**How to apply:** Keep React Native style arrays on `View` and native video components, but flatten or explicitly build CSS objects for raw HTML media elements.