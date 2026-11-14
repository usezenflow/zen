import { StyleSheet, Text, View } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";
import { EASE, Tap } from "@/components/tap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/lib/i18n";
import { useTheme, font, ff } from "@/lib/theme";

// A short drop-in and lift-out: 8px and a touch of scale, no bounce.
const toastIn = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -8 }, { scale: 0.98 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: EASE } }).duration(200);
const toastOut = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] }, 100: { opacity: 0, transform: [{ translateY: -6 }, { scale: 0.98 }], easing: EASE } }).duration(150);

/**
 * ui.js toast(): title and sub wrap (two lines each); actions sit right beside the text, vertically centred.
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
    <Animated.View entering={toastIn} exiting={toastOut} style={[s.toast, { top, backgroundColor: bg }]}>
      <View style={s.tx} accessibilityRole={error ? "alert" : undefined}>
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
  toast: { position: "absolute", left: 12, right: 12, zIndex: 30, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, borderRadius: 20, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  tx: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  t1: { fontSize: font.md, fontFamily: ff("700"), lineHeight: 20 },
  sub: { marginTop: 1, fontSize: font.label, fontFamily: ff("500"), lineHeight: 19, color: "#7f7f7f" },
  a: { height: 32, paddingHorizontal: 12, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  at: { fontSize: font.sub, fontFamily: ff("700") },
});
