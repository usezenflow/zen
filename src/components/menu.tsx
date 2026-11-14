import { Button, ContextMenu, HStack, Host, Image, Menu, Text as SText } from "@expo/ui/swift-ui";
import { RNHostView } from "@expo/ui";
import { font as sfont, labelStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { useState, type ReactElement } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MenuPanel } from "@/components/rowmenu";
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
        {icon ?? <Text style={{ color: color ?? th.ink, fontSize: size ?? 15, fontFamily: ff("500") }}>{label}</Text>}
      </Pressable>
      {open && (
        <>
          <Pressable style={s.scrim} onPress={() => setOpen(false)} />
          <MenuPanel items={items} onPick={(i) => { setOpen(false); i.onPress(); }} style={s.menu} />
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  scrim: { position: "absolute", top: -2000, bottom: -2000, left: -2000, right: -2000 },
  menu: { position: "absolute", top: "100%", right: 0 },
});

interface DropProps { icon?: ReactElement; sf?: SFSymbol; label: string; items: Item[]; color?: string; size?: number; chevron?: boolean; style?: StyleProp<ViewStyle> }

/** Native iOS dropdown (Android: RN fallback). `icon` is the Android trigger glyph; `sf` the iOS SF symbol; `color`/`size` style a text trigger. */
export function DropMenu(p: Omit<DropProps, "label"> & { label?: string }) {
  const { sf, label = "", items, color, size, style, chevron } = p;
  if (Platform.OS !== "ios") return <AndroidDrop {...p} label={label} />;
  return (
    <Host matchContents style={style}>
      <Menu label={chevron ? <HStack spacing={4}><SText>{label}</SText><Image systemName="chevron.down" size={size ? size * 0.7 : 10} /></HStack> : label} systemImage={chevron ? undefined : sf} modifiers={[...(color ? [tint(color)] : []), ...(size ? [sfont({ size, weight: "medium" })] : []), ...(label ? [] : [labelStyle("iconOnly")])]}>{buttons(items)}</Menu>
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
