---
name: Expo Router custom tab bar
description: Expo Router 57 places the custom bottom bar on Tabs itself, not inside screenOptions.
---

In the current Expo Router version, pass the custom bottom bar as the top-level `tabBar` prop on `Tabs`. The supported `BottomTabBarProps` type is exposed through Expo Router's bundled bottom-tabs module rather than a separately installed `@react-navigation/bottom-tabs` package.

**Why:** Putting `tabBar` inside `screenOptions` or importing the type from an uninstalled React Navigation package breaks the mobile TypeScript check even though the runtime API supports a custom bar.

**How to apply:** When changing the mobile tab navigation, keep the custom bar on `<Tabs tabBar={...}>` and use the Expo Router bundled type path unless the project adds a direct navigation dependency.