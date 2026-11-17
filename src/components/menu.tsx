import { Hit } from "@/components/tap";
import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MenuPanel } from "@/components/rowmenu";
import type { IconName } from "@/components/icons";
import { useTheme, ff } from "@/lib/theme";

export interface Item { label: string; icon: IconName; destructive?: boolean; onPress: () => void }

interface DropProps { icon?: ReactElement; label?: string; items: Item[]; color?: string; size?: number; chevron?: boolean; style?: StyleProp<ViewStyle> }

/** Zen's own dropdown on every platform (never the OS menu), anchored under the trigger: right edge for icons, left edge for a text/chevron trigger. */
export function DropMenu({ icon, label = "", items, color, size, chevron, style }: DropProps) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <Hit onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={label || "menu"} hitSlop={8}>
        {icon ?? <Text style={{ color: color ?? th.ink, fontSize: size ?? 15, fontFamily: ff("500") }}>{label}</Text>}
      </Hit>
      {open && (
        <>
          <Pressable style={s.scrim} onPress={() => setOpen(false)} />
          <MenuPanel items={items} onPick={(i) => { setOpen(false); i.onPress(); }} origin={chevron ? "top left" : "top right"} style={[s.menu, chevron ? s.left : s.right]} />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: -2000, bottom: -2000, left: -2000, right: -2000 },
  menu: { position: "absolute", top: "100%" },
  right: { right: 0 },
  left: { left: 0 },
});
