import { StyleSheet, Text, View } from "react-native";
import { Tap } from "@/components/tap";
import type { Box } from "@/components/outside";
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
  hourglass: [["path", { d: "M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l-2.4 2.3A4 4 0 0 0 8 17.5V21M16 3v3.5a4 4 0 0 1-1.6 3.2L12 12l2.4 2.3A4 4 0 0 1 16 17.5V21" }]],
  repeat: [["path", { d: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" }]],
  dots: [["circle", { cx: 6, cy: 12, r: 1 }], ["circle", { cx: 12, cy: 12, r: 1 }], ["circle", { cx: 18, cy: 12, r: 1 }]],
  right: [["path", { d: "M9 6l6 6-6 6" }]],
} as const;
export type Glyph = Exclude<keyof typeof G, "right">;

export function Gly({ name, size, color, w = 2 }: { name: keyof typeof G; size: number; color: string; w?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {G[name].map((e, i) => (e[0] === "path" ? <Path key={i} {...e[1]} /> : <Circle key={i} {...e[1]} />))}
    </Svg>
  );
}

/** One detail line (mockup .dmeta div): icon, text. Plain text is a 28pt row; only a tappable line takes the 44pt touch area (hitSlop) and the chevron on a link. */
export function Meta({ icon, text, tone, onPress }: { icon: Glyph; text: string; tone?: "link" | "red"; onPress?: () => void }) {
  const th = useTheme();
  const color = tone === "red" ? th.seal : tone === "link" ? th.ink : th.muted;
  const body = (
    <>
      <View style={{ opacity: 0.8 }}><Gly name={icon} size={18} color={color} w={2} /></View>
      <Text style={[s.t, { color, fontFamily: ff("500") }]} numberOfLines={1}>{text}</Text>
      {tone === "link" && <View style={{ opacity: 0.85, marginLeft: -4 }}><Gly name="right" size={18} color={color} /></View>}
    </>
  );
  return onPress ? <Tap onPress={onPress} scale={0.98} hitSlop={8} style={s.row}>{body}</Tap> : <View style={s.row}>{body}</View>;
}

/** A meta line opened for editing: icon, then the native pickers (children) in place. */
/** An open line: its glyph, or a word in the glyph's place ("đến" on the end line under the start). */
export function EdLine({ icon, word, tone, children, ref }: { icon?: Glyph; word?: string; tone?: "red"; children: React.ReactNode; ref?: React.Ref<Box> }) {
  const th = useTheme();
  return (
    <View ref={ref} collapsable={false} style={s.ed}>
      <View style={s.edIcon}>{icon ? <Gly name={icon} size={20} color={tone === "red" ? th.seal : th.ink} w={2} /> : <Text style={[s.word, { color: th.muted }]}>{word}</Text>}</View>
      {children}
    </View>
  );
}

export type Tone = "ok" | "info" | "warn" | "err";
const TINT = { ok: ["ok", "okT"], info: ["info", "infoT"], warn: ["warnInk", "warnT"], err: ["err", "errT"] } as const;
/** .st: a state chip (a dot, a word, a tint). Green done or on track, blue information, amber a warning, red only an error. */
export function State({ tone, text, after }: { tone: Tone; text: string; after?: React.ReactNode }) {
  const th = useTheme();
  const [fg, bg] = TINT[tone];
  return (
    <View style={[s.st, { backgroundColor: th[bg] }]}>
      <View style={[s.dot, { backgroundColor: th[fg] }]} />
      <Text style={[s.stT, { color: th[fg] }]}>{text}</Text>
      {after}
    </View>
  );
}

const s = StyleSheet.create({
  ed: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 }, // one line: its chips shrink their text to fit rather than wrap
  edIcon: { opacity: 0.85, marginRight: 4, minWidth: 20 }, // .meta svg opacity, .meta .ed svg margin-right
  word: { minWidth: 20, fontFamily: ff("500"), fontSize: font.label, textAlign: "center" }, // fits the glyph's 20px
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 }, // .dmeta div: a 28pt line, no padding
  t: { fontFamily: ff(), fontSize: font.meta, lineHeight: 22.4, flexShrink: 1 },
  st: { flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 99, alignSelf: "flex-start" }, // .st: 28 tall, a dot
  dot: { width: 7, height: 7, borderRadius: 4 }, // .st i
  stT: { fontSize: 13.5, lineHeight: 18, fontFamily: ff("500") },
});
