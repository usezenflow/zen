import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function Toast({ text, onUndo }: { text: string; onUndo?: () => void }) {
  const th = useTheme();
  const glass = isLiquidGlassAvailable();
  const body = (
    <>
      <Text style={[s.text, { color: th.text }]} numberOfLines={2}>{text}</Text>
      {onUndo && (
        <Pressable onPress={onUndo} hitSlop={12}>
          <Text style={[s.undo, { color: th.sun }]}>{t("undo")}</Text>
        </Pressable>
      )}
    </>
  );
  return glass ? (
    <GlassView style={s.toast} glassEffectStyle="regular">{body}</GlassView>
  ) : (
    <View style={[s.toast, { backgroundColor: th.card, borderColor: th.line, borderWidth: 1 }]}>{body}</View>
  );
}

const s = StyleSheet.create({
  toast: { position: "absolute", left: 16, right: 16, bottom: 150, minHeight: 52, borderRadius: 26, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1, fontSize: 15, fontWeight: "600" },
  undo: { fontSize: 15, fontWeight: "800" },
});
