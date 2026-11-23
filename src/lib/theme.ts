import { useColorScheme } from "react-native";

// Tokens mirror mockups/ui.css (:root and .device.dark).
const light = { bg: "#fbfaf7", ink: "#16181b", muted: "#8d8f8c", line: "#e6e4de", chip: "#f0eee9" };
const dark = { bg: "#121314", ink: "#ecebe6", muted: "#7f817e", line: "#26282a", chip: "#1c1d1f" };

// Same in both modes: art stays colourful on a paper ui.
// Readability scale, grown for touch and small phones (320dp): label/sub 16, md (chips, buttons) 17, meta 16, body 17, title 30.
export const font = { label: 16, sub: 16, md: 17, meta: 16, base: 17, lg: 24, xl: 26, h: 30 } as const;
export const space = { gutter: 24, row: 15, xs: 4, sm: 8, md: 12, lg: 14, xl: 18, xxl: 24 } as const;

const fixed = {
  onart: "#ffffff",
  seal: "#d9432b", // vermilion
  // type -> [dark, mid, light] stops from PAL in ui.js
  art: {
    plan: ["#1f2b6e", "#4f68e8", "#a9b9ff"],
    lecture: ["#123f3a", "#2f8a78", "#a8dccb"],
    exam: ["#7a1d10", "#d9432b", "#ffb39f"],
    assignment: ["#3a2056", "#8a5cc4", "#dccaf5"],
    busy: ["#8d8f8c", "#bdbcb6", "#e6e4de"],
  },
  // type -> small dot colour (DOT in ui.js)
  dot: { plan: "#4f68e8", lecture: "#2f8a78", exam: "#d9432b", assignment: "#8a5cc4", busy: "#bdbcb6" },
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
// Shared timings; the curve is EASE in components/tap.
export const motion = {
  fast: 180,
  progress: 400,
} as const;
