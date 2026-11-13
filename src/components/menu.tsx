import { Button, ContextMenu, Host, Menu } from "@expo/ui/swift-ui";
import { RNHostView } from "@expo/ui";
import { font as sfont, tint } from "@expo/ui/swift-ui/modifiers";
import { useState, type ReactElement } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, ff } from "@/lib/theme";
import type { SFSymbol } from "sf-symbols-typescript";

export interface Item { label: string; icon?: SFSymbol; destructive?: boolean; onPress: () => void }

const buttons = (items: Item[]) =>
  items.map((i) => <Button key={i.label} label={i.label} systemImage={i.icon} role={i.destructive ? "destructive" : "default"} onPress={i.onPress} />);

/** Android fallback: small text-only dropdown (mockup .menu), anchored under the trigger. */
function AndroidDrop({ icon, label, items, color, size, style }: DropProps) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={label || "menu"} hitSlop={8}>
        {label ? <Text style={{ color: color ?? th.ink, fontSize: size ?? 15, fontFamily: ff("500") }}>{label}</Text> : icon}
      </Pressable>
      {open && (
        <>
          <Pressable style={s.scrim} onPress={() => setOpen(false)} />
          <View style={[s.menu, { backgroundColor: th.chip, borderColor: th.line }]}>
            {items.map((i, n) => (
              <Pressable key={i.label} onPress={() => { setOpen(false); i.onPress(); }} style={[s.mi, n > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
                <Text style={{ fontSize: 17, fontFamily: ff("500"), color: i.destructive ? "#ff3b30" : th.ink }}>{i.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  scrim: { position: "absolute", top: -2000, bottom: -2000, left: -2000, right: -2000 },
  menu: { position: "absolute", top: "100%", right: 0, minWidth: 200, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", elevation: 8, zIndex: 25 },
  mi: { height: 50, paddingHorizontal: 20, justifyContent: "center" },
});

interface DropProps { icon?: ReactElement; sf?: SFSymbol; label: string; items: Item[]; color?: string; size?: number; style?: StyleProp<ViewStyle> }

/** Native iOS dropdown (Android: RN fallback). `icon` is the Android trigger glyph; `sf` the iOS SF symbol; `color`/`size` style a text trigger. */
export function DropMenu(p: Omit<DropProps, "label"> & { label?: string }) {
  const { sf, label = "", items, color, size, style } = p;
  if (Platform.OS !== "ios") return <AndroidDrop {...p} label={label} />;
  return (
    <Host matchContents style={style}>
      <Menu label={label} systemImage={sf} modifiers={color || size ? [...(color ? [tint(color)] : []), ...(size ? [sfont({ size, weight: "medium" })] : [])] : undefined}>{buttons(items)}</Menu>
    </Host>
  );
}

/** Long-press on any RN content lifts it and shows the native menu (rows). */
export function HoldMenu({ items, children }: { items: Item[]; children: ReactElement }) {
  if (Platform.OS !== "ios") return children;
  return (
    <Host matchContents={{ vertical: true }}>
      <ContextMenu>
        <ContextMenu.Items>{buttons(items)}</ContextMenu.Items>
        <ContextMenu.Trigger><RNHostView matchContents={{ vertical: true }}>{children}</RNHostView></ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
