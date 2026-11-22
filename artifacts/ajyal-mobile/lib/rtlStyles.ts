import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * The app runs with I18nManager.isRTL = false, so a plain `flexDirection: "row"`
 * lays children out left to right even for Arabic. This returns a copy of a style
 * map where every plain row is a row-reverse (and row justify start/end are swapped)
 * when the UI direction is RTL. Styles that are already row-reverse, or overridden
 * inline, are left untouched.
 */
export function rtlStyles<T extends Record<string, AnyStyle>>(styles: T, direction: "rtl" | "ltr"): T {
  if (direction !== "rtl") return styles;
  const out: Record<string, AnyStyle> = {};
  for (const [name, style] of Object.entries(styles)) {
    const view = style as ViewStyle;
    if (view && view.flexDirection === "row") {
      const next: ViewStyle = { ...view, flexDirection: "row-reverse" };
      if (view.justifyContent === "flex-start") next.justifyContent = "flex-end";
      else if (view.justifyContent === "flex-end") next.justifyContent = "flex-start";
      out[name] = next;
    } else {
      out[name] = style;
    }
  }
  return out as T;
}
