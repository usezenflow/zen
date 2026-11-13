import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { Tap } from "@/components/tap";
import type { Item } from "@/components/menu";
import { useTheme, font, space, ff } from "@/lib/theme";

/** RN dropdown under a row (mockup .menu): text-only 50px rows, hairlines, fits the longest label. Outside tap closes. */
export function RowMenu({ items, top, onClose }: { items: Item[]; top: number; onClose: () => void }) {
  const th = useTheme();
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={ZoomIn.springify().damping(22).stiffness(320)} exiting={FadeOut.duration(120)} style={[s.menu, { transformOrigin: "top right" }, { top, backgroundColor: th.dark ? "rgba(44,44,46,0.94)" : "rgba(250,250,248,0.94)" }]}>
        {items.map((i, k) => (
          <Tap variant="row" key={i.label} onPress={() => { onClose(); i.onPress(); }} style={[s.mi, k > 0 && s.sep]}>
            <Text style={[s.t, { color: i.destructive ? "#ff3b30" : th.ink }]}>{i.label}</Text>
          </Tap>
        ))}
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  menu: { position: "absolute", right: space.gutter, zIndex: 25, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 14 } },
  mi: { height: 50, paddingHorizontal: 20, justifyContent: "center" },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(127,127,127,0.28)" },
  t: { fontSize: font.base, fontFamily: ff("500") },
});
