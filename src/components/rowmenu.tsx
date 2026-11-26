import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "@/components/icons";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { Tap, EASE } from "@/components/tap";
import type { Item } from "@/components/menu";
import { useTheme, font, ff, space } from "@/lib/theme";
import { t } from "@/lib/i18n";
import type { Task } from "@/lib/types";

/** A sitting or a split task's items: one sitting more; one less only while two are open. A plain open task gets "more" only. */
export function sittingItems(x: Task, tasks: Task[], on: { more: (parent: Task) => void; less: (parent: Task) => void }): Item[] {
  if (x.doneAt || x.deletedAt) return [];
  const parentId = x.parentId ?? x.id, open = tasks.filter((c) => c.parentId === parentId && !c.doneAt && !c.deletedAt);
  // A single-instance task (no repeat, no section) is split on the first "more": addSitting makes it its own first sitting.
  if (!open.length && (x.parentId || x.rrule || x.seriesId || x.section)) return [];
  const parent = tasks.find((p) => p.id === parentId) ?? x;
  return [
    { label: t("itemMore"), icon: "clock", onPress: () => on.more(parent) },
    ...(open.length > 1 ? [{ label: t("itemLess"), icon: "minus" as const, onPress: () => on.less(parent) }] : []),
  ];
}

/**
 * ui.css .menu: frosted panel (blur 28px, saturate 1.6), rgba(250,250,248,.8) / dark rgba(44,44,46,.78),
 * 50px rows, icon then label, split by .5px hairlines, fits the longest label (min 200).
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
          <Icon name={i.icon} size={20} color={i.destructive ? "#ff3b30" : th.ink} />
          <Text numberOfLines={1} style={[s.t, { color: i.destructive ? "#ff3b30" : th.ink }]}>{i.label}</Text>
        </Tap>
      ))}
    </Animated.View>
  );
}

/** Where a row's menu of `n` items goes, in window coordinates (the SafeAreaView's absolute children start at its outer edge, not under the inset):
 *  under the row, or over it when it would run into the mic at the bottom; never on the row itself. */
export function menuTop(bottom: number, top: number, n: number, winH: number, insetTop: number, insetBottom: number, dock = 90): number {
  const h = n * 50 + 1;
  return bottom + 4 + h <= winH - insetBottom - dock || top - 4 - h < insetTop ? bottom + 4 : top - 4 - h;
}

/** Dropdown under a row, centred on the screen; `right`: under a trigger at the right edge (the kind chip), its right edge on the gutter. Outside tap closes. */
export function RowMenu({ items, top, onClose, right }: { items: Item[]; top: number; onClose: () => void; right?: boolean }) {
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      <View pointerEvents="box-none" style={[s.center, { top }, right && { paddingRight: space.gutter }]}>
        <MenuPanel items={items} onPick={(i) => { onClose(); i.onPress(); }} origin={right ? "top right" : "top center"} style={{ alignSelf: right ? "flex-end" : "center" }} />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  menu: { zIndex: 25, minWidth: 200, alignSelf: "flex-start", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 18px 40px -8px rgba(0,0,0,0.28)" },
  center: { position: "absolute", left: 0, right: 0 },
  mi: { height: 50, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  sep: { borderTopWidth: 0.5, borderTopColor: "rgba(127,127,127,0.28)" },
  t: { flexShrink: 1, fontSize: font.base, fontFamily: ff("500") },
});
