import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Logo } from "@/components/art";
import { fadeIn, fadeOut, Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, ff } from "@/lib/theme";

/** logo.html States: the first school sync (leaf rocking) or a failed one (leaf tipped, sun rolled away), full screen, no dock. */
export function LogoState({ state, onRetry, onLater }: { state: "load" | "err"; onRetry?: () => void; onLater?: () => void }) {
  const th = useTheme();
  const err = state === "err";
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={[StyleSheet.absoluteFill, s.wrap, { backgroundColor: th.bg }]} accessibilityLiveRegion="polite">
      <View style={s.state}>
        <Logo size={96} mode="color" color={th.ink} state={state} />
        <Text style={[s.h, { color: th.ink }]}>{t(err ? "syncErrT" : "syncLoadT")}</Text>
        <Text style={[s.sub, { color: th.muted }]}>{t(err ? "syncErrSub" : "syncLoadSub")}</Text>
        {err && <>
          <Tap onPress={onRetry} style={[s.btn, { backgroundColor: th.ink }]} accessibilityRole="button"><Text style={[s.bt, { color: th.bg }]}>{t("retry")}</Text></Tap>
          <Tap onPress={onLater} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: th.muted }]}>{t("notNow")}</Text></Tap>
        </>}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { zIndex: 40, paddingHorizontal: 24 },
  // .state: centred column, gap 6, 90px clear at the bottom
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 90 },
  h: { marginTop: 22, fontSize: 24, lineHeight: 28.8, fontFamily: ff("600"), letterSpacing: -0.6, textAlign: "center" }, // .h at 24px
  sub: { marginTop: 6, maxWidth: 220, fontSize: 15, lineHeight: 21.75, fontFamily: ff("400"), textAlign: "center" }, // .sub, line-height 1.45
  btn: { marginTop: 22, alignSelf: "stretch", height: 56, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  bt: { fontSize: 17, fontFamily: ff("700") },
  ghost: { marginTop: 10, fontSize: 15, fontFamily: ff("600") },
});
