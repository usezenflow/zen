import { StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme, font, ff } from "@/lib/theme";

// Paths from mockups ui.js (I.*), 24px grid.
const G = {
  trash: [["path", { d: "M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" }]],
  pin: [["path", { d: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" }], ["circle", { cx: 12, cy: 10, r: 2.3 }]],
  person: [["circle", { cx: 12, cy: 8, r: 3.6 }], ["path", { d: "M5 20a7 7 0 0 1 14 0" }]],
  book: [["path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z" }], ["path", { d: "M4 19.5V22h16" }]],
  link: [["path", { d: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M12 7.5V12l3 2" }]],
  repeat: [["path", { d: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" }]],
  right: [["path", { d: "M9 6l6 6-6 6" }]],
} as const;
export type Glyph = Exclude<keyof typeof G, "right">;

export function Gly({ name, size, color, w = 1.8 }: { name: keyof typeof G; size: number; color: string; w?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {G[name].map((e, i) => (e[0] === "path" ? <Path key={i} {...e[1]} /> : <Circle key={i} {...e[1]} />))}
    </Svg>
  );
}

/** One muted meta line (mockup .meta div): icon, text, optional chevron when tappable. */
export function Meta({ icon, text, tone, onPress }: { icon: Glyph; text: string; tone?: "link" | "red"; onPress?: () => void }) {
  const th = useTheme();
  const color = tone === "red" ? th.seal : tone === "link" ? th.ink : th.muted;
  return (
    <Tap onPress={onPress} disabled={!onPress} scale={0.98} style={s.row}>
      <View style={{ opacity: 0.85 }}><Gly name={icon} size={20} color={color} w={1.9} /></View>
      <Text style={[s.t, { color, fontFamily: ff(tone ? "600" : "500") }]} numberOfLines={1}>{text}</Text>
      {onPress && <View style={{ opacity: 0.85, marginLeft: -4 }}><Gly name="right" size={16} color={color} /></View>}
    </Tap>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  t: { fontFamily: ff(), fontSize: font.meta, lineHeight: 22, flexShrink: 1 },
});
