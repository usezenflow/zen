import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { Tap, EASE } from "@/components/tap";
import type { Item } from "@/components/menu";
import { useTheme, font, ff } from "@/lib/theme";

/**
 * ui.css .menu: frosted panel (blur 28px, saturate 1.6), rgba(250,250,248,.8) / dark rgba(44,44,46,.78),
 * text-only 50px rows split by .5px hairlines, fits the longest label (min 200).
 */
export function MenuPanel({ items, onPick, style, origin = "top right" }: { items: Item[]; onPick: (i: Item) => void; style?: StyleProp<ViewStyle>; origin?: string }) {
  const th = useTheme();
  return (
    <Animated.View entering={ZoomIn.duration(180).easing(EASE)} exiting={FadeOut.duration(120)} style={[s.menu, { transformOrigin: origin }, style]}>
      {/* shortcut: Android draws the tint only (no BlurTargetView behind the whole screen); add one if it reads too flat. */}
      <BlurView intensity={60} tint={th.dark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: th.dark ? "rgba(44,44,46,0.78)" : "rgba(250,250,248,0.8)" }]} />
      {items.map((i, k) => (
        <Tap variant="row" key={i.label} onPress={() => onPick(i)} accessibilityRole="menuitem" style={[s.mi, k > 0 && s.sep]}>
          <Text style={[s.t, { color: i.destructive ? "#ff3b30" : th.ink }]}>{i.label}</Text>
        </Tap>
      ))}
    </Animated.View>
  );
}

/** Dropdown under a row (views.html menu(DEL, top, 18)). Outside tap closes. */
export function RowMenu({ items, top, onClose }: { items: Item[]; top: number; onClose: () => void }) {
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      <MenuPanel items={items} onPick={(i) => { onClose(); i.onPress(); }} style={{ position: "absolute", top, right: 18 }} />
    </>
  );
}

const s = StyleSheet.create({
  menu: { zIndex: 25, minWidth: 200, alignSelf: "flex-start", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 18px 40px -8px rgba(0,0,0,0.28)" },
  mi: { height: 50, paddingHorizontal: 20, justifyContent: "center" },
  sep: { borderTopWidth: 0.5, borderTopColor: "rgba(127,127,127,0.28)" },
  t: { fontSize: font.base, fontFamily: ff("500") },
});
