import { useColorScheme } from "react-native";

// Tokens mirror mockups/ui.css (:root and .device.dark).
// States (v2.css :root / .device.dark): ok = done and on track, info = information and what Zen changed, warn = look at this, err = error only.
const light = { bg: "#ffffff", ink: "#0d0d0f", muted: "#737a87", line: "#e1e5ec", chip: "#f1f3f7", soft: "#f5f7fa", accent: "#0d0d0f", onAccent: "#ffffff", brand: "#ff8a5c", ok: "#0f8f6a", okT: "rgba(15, 143, 106, .14)", info: "#737a87", infoT: "rgba(115, 122, 135, .12)", warn: "#e8743b", warnT: "rgba(255, 138, 92, .18)", warnInk: "#8a3a1a", err: "#d2492f", errT: "rgba(210, 73, 47, .12)" };
const dark = { bg: "#0d0d0f", ink: "#f2f3f5", muted: "#8a8d94", line: "#2a2c31", chip: "#1a1b1f", soft: "#15161a", accent: "#f2f3f5", onAccent: "#0d0d0f", brand: "#ff8a5c", ok: "#3fe0b0", okT: "rgba(63, 224, 176, .16)", info: "#a9adb5", infoT: "rgba(169, 173, 181, .14)", warn: "#ff9a73", warnT: "rgba(255, 138, 92, .16)", warnInk: "#ffb899", err: "#ff7a62", errT: "rgba(255, 122, 98, .16)" };

// Same in both modes: art stays colourful on a paper ui.
// Readability scale, grown for touch and small phones (320dp): label/sub 16, md (chips, buttons) 17, meta 16, body 17, title 30.
export const font = { label: 16, sub: 16, md: 17, meta: 16, base: 17, lg: 24, xl: 26, h: 30 } as const;
export const space = { gutter: 24, row: 15, xs: 4, sm: 8, md: 12, lg: 14, xl: 18, xxl: 24 } as const;

const fixed = {
  onart: "#ffffff",
  seal: "#d2492f", // vermilion
  // type -> line-field colours (PAL in the reference): a ground start, b the field, c ground end, d the edge field. busy is grey.
  art: {
    plan: { a: "#11b9d4", b: "#2433f2", c: "#a8f0ff", d: "#5a3cff" }, // lagoon
    lecture: { a: "#bfe36a", b: "#0f8f6a", c: "#7cc8f0", d: "#1fd1a0" }, // moss
    exam: { a: "#ffc83a", b: "#ff4f2a", c: "#ffb0c4", d: "#ff8a00" }, // citrus
    assignment: { a: "#e9b04f", b: "#c21f86", c: "#a38ff0", d: "#ff4a5e" }, // dusk
    night: { a: "#1e2a8a", b: "#7a4dff", c: "#35e0ff", d: "#ff5ac8" }, // work, finance (artOf)
    clay: { a: "#ebc8a4", b: "#cf4a2c", c: "#5f80dc", d: "#f08a5d" }, // self, other, some assignments
    busy: { a: "#c9c8c2", b: "#8d8f8c", c: "#e6e4de", d: "#a4a6a2" },
  },
  radius: { art: 28, toast: 24, pill: 99, card: 28, sm: 10 },
  font,
  space,
  weight: { light: "300", regular: "400", medium: "500", semi: "600", bold: "700", black: "800" },
} as const;

export type TypeName = keyof typeof fixed.art;

export function useTheme() {
  const isDark = useColorScheme() === "dark";
  const c = isDark ? dark : light;
  return {
    dark: isDark,
    ...c,
    ...fixed,
    // legacy keys used by existing screens
    text: c.ink,
    card: c.chip,
    sun: fixed.seal,
    red: fixed.seal,
  };
}
export type Theme = ReturnType<typeof useTheme>;
export const FONT = "Be Vietnam Pro";
// Exact face per weight: iOS weight-matching on custom families is unreliable and Android ignores it.
const FACES: Record<string, string> = {
  "300": "BeVietnamPro-Light", "400": "BeVietnamPro-Regular", "500": "BeVietnamPro-Medium",
  "600": "BeVietnamPro-SemiBold", "700": "BeVietnamPro-Bold", "800": "BeVietnamPro-ExtraBold",
};
export const ff = (w: string | number = "400") => FACES[String(w)] ?? FACES["400"];
// Display face (Bricolage Grotesque) for big titles and numbers only; body text stays on ff().
const DISPLAY: Record<string, string> = { "500": "BricolageGrotesque-Medium", "700": "BricolageGrotesque-Bold", "800": "BricolageGrotesque-ExtraBold" };
export const fd = (w: string | number = "700") => DISPLAY[String(w)] ?? DISPLAY["700"];
// Shared timings; the curve is EASE in components/tap.
export const motion = {
  fast: 180,
  progress: 400,
} as const;
