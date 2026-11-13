import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { Tap } from "@/components/tap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/lib/i18n";
import { useTheme, font, ff } from "@/lib/theme";

/**
 * ui.js toast(): title and sub wrap (two lines each); actions sit in a bottom row, right-aligned.
 * The alternative slot is an outline pill left of Undo ("hoặc T7 09:00").
 * `error`: vermilion with white text, for failures (model not ready, mic, download).
 */
export function Toast({ text, sub, onAction, actionLabel, onAlt, altLabel, error }: {
  text: string; sub?: string; onAction?: () => void; actionLabel?: string; onAlt?: () => void; altLabel?: string; error?: boolean;
}) {
  const th = useTheme();
  const top = useSafeAreaInsets().top;
  const alt = onAlt && altLabel;
  const bg = error ? th.seal : th.ink, fg = error ? "#fff" : th.bg;
  return (
    <Animated.View entering={FadeInUp.springify().damping(18).stiffness(220)} exiting={FadeOutUp.duration(160)} style={[s.toast, { top, backgroundColor: bg }]}>
      <View accessibilityRole={error ? "alert" : undefined}>
        <Text numberOfLines={2} style={[s.t1, { color: fg }]}>{text}</Text>
        {!!sub && <Text numberOfLines={2} style={[s.sub, error && { color: "rgba(255,255,255,0.85)" }]}>{sub}</Text>}
      </View>
      {(!!alt || !!onAction) && (
        <View style={s.row}>
          {alt && <Tap onPress={onAlt} hitSlop={8} style={[s.a, { borderWidth: 1, borderColor: "rgba(127,127,127,0.5)" }]}><Text style={[s.at, { color: fg }]}>{t("orWhen", { when: altLabel })}</Text></Tap>}
          {onAction && (
            <Tap onPress={onAction} hitSlop={8} style={[s.a, { backgroundColor: error ? "#fff" : th.bg }]}>
              <Text style={[s.at, { color: bg }]}>{actionLabel ?? t("undo")}</Text>
            </Tap>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: { position: "absolute", left: 12, right: 12, zIndex: 30, gap: 10, paddingVertical: 12, paddingLeft: 18, paddingRight: 12, borderRadius: 24, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  t1: { fontSize: font.md, fontFamily: ff("700"), lineHeight: 20 },
  sub: { marginTop: 1, fontSize: font.label, fontFamily: ff("500"), lineHeight: 19, color: "#7f7f7f" },
  a: { height: 36, paddingHorizontal: 13, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  at: { fontSize: font.sub, fontFamily: ff("700") },
});
