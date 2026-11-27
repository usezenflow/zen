import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Icon, Logo } from "@/components/art";
import { fadeIn, fadeOut, Tap } from "@/components/tap";
import { t } from "@/lib/i18n";
import { useTheme, ff, fd } from "@/lib/theme";

/** logo.html States: the first school sync (leaf rocking) or a failed one (leaf tipped, sun rolled away), full screen, no dock. */
export function LogoState({ state, onRetry, onLater, title, sub }: { state: "load" | "err"; onRetry?: () => void; onLater?: () => void; title?: string; sub?: string }) {
  const th = useTheme();
  const err = state === "err";
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={[StyleSheet.absoluteFill, s.wrap, { backgroundColor: th.bg }]} accessibilityLiveRegion="polite">
      <View style={s.state}><Logo size={96} mode="color" state={state} /></View>
      {/* The words sit at the bottom, where the thinking steps do; no chip, so nothing here looks like a button. */}
      <View style={s.foot}>
        <Text style={[s.h, { color: th.ink }]}>{title ?? t(err ? "syncErrT" : "syncLoadT")}</Text>
        <Text style={[s.sub, { color: th.muted }]}>{sub ?? t(err ? "syncErrSub" : "syncLoadSub")}</Text>
        {err && <>
          <Tap onPress={onRetry} style={[s.btn, { backgroundColor: th.ink }]} accessibilityRole="button"><Icon name="refresh" size={18} color={th.bg} w={2} /><Text style={[s.bt, { color: th.bg }]}>{t("retry")}</Text></Tap>
          <Tap onPress={onLater} hitSlop={8} accessibilityRole="button"><Text style={[s.ghost, { color: th.muted }]}>{t("notNow")}</Text></Tap>
        </>}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { zIndex: 40, paddingHorizontal: 24 },
  // .state: centred column, gap 6, 90px clear at the bottom
  state: { flex: 1, alignItems: "center", justifyContent: "center" },
  foot: { position: "absolute", left: 24, right: 24, bottom: 110, alignItems: "center" },
  h: { marginTop: 0, fontSize: 26, lineHeight: 34, fontFamily: fd("800"), letterSpacing: -0.91, textAlign: "center" }, // logo.html .state .h: 26px, line 1.1
  sub: { marginTop: 6, maxWidth: 230, fontSize: 17, lineHeight: 24.65, fontFamily: ff("400"), textAlign: "center" }, // .sub, line-height 1.45
  btn: { marginTop: 22, alignSelf: "stretch", height: 56, borderRadius: 99, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  bt: { fontSize: 17, fontFamily: ff("600") },
  ghost: { marginTop: 10, fontSize: 15, fontFamily: ff("500") },
});

/** The app's first screen: logo.html "Loading" with start-up words. The native splash is a plain background, this takes over at once. */
export const Boot = () => <LogoState state="load" title={t("bootT")} sub={t("bootSub")} />;
