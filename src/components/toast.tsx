import { bolded } from "@/components/bold";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { EASE, settle, Tap } from "@/components/tap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/lib/i18n";
import { useTheme, font, ff } from "@/lib/theme";

// A short drop-in and lift-out: 8px and a touch of scale, no bounce.
const toastIn = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -8 }, { scale: 0.98 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: EASE } }).duration(200);
const toastOut = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] }, 100: { opacity: 0, transform: [{ translateY: -6 }, { scale: 0.98 }], easing: EASE } }).duration(150);

/**
 * ui.js toast(): title and sub wrap (two lines each); actions sit in a bottom row, right-aligned.
 * The alternative slot is an outline pill left of Undo ("hoặc T7 09:00"); `altPlain`: an action of its own ("Xem"), no "hoặc".
 * Swipe it up or sideways to put it away (`onDismiss`).
 * `error`: vermilion with white text, for failures (model not ready, mic, download).
 * `lead`: drawn left of the text (the update download's ring).
 */
export function Toast({ text, sub, onAction, actionLabel, onAlt, altLabel, altPlain, error, onDismiss, lead }: {
  text: string; sub?: string; onAction?: () => void; actionLabel?: string; onAlt?: () => void; altLabel?: string; altPlain?: boolean; error?: boolean; onDismiss?: () => void; lead?: ReactNode;
}) {
  const th = useTheme();
  const top = useSafeAreaInsets().top - 8; // .toast top 46 against the mockup's 54 content top
  const alt = onAlt && altLabel;
  const bg = error ? th.seal : th.ink, fg = error ? "#fff" : th.bg;
  const x = useSharedValue(0), y = useSharedValue(0);
  const pan = usePanGesture({
    testID: "toast", // tests drive the dismiss swipe by this id; RNGH drops it from release builds
    enabled: !!onDismiss,
    onUpdate: (e) => { "worklet"; x.set(e.translationX); y.set(Math.min(0, e.translationY)); },
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) > 80 || e.translationY < -40) {
        // carry it off the way it was going, then let it go
        x.set(withTiming(Math.abs(e.translationX) > 80 ? Math.sign(e.translationX) * 400 : x.get(), { duration: 160 }));
        y.set(withTiming(Math.abs(e.translationX) > 80 ? y.get() : -160, { duration: 160 }, (ok) => { if (ok && onDismiss) scheduleOnRN(onDismiss); }));
      } else { x.set(settle(0)); y.set(settle(0)); }
    },
  });
  const drag = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  return (
    <GestureDetector gesture={pan}>
    <Animated.View style={[s.drag, { top }, drag]}>
    <Animated.View entering={toastIn} exiting={toastOut} style={[s.toast, { backgroundColor: bg }]}>
      <View style={s.tl}>
        {lead}
        <View style={s.tx} accessibilityRole={error ? "alert" : undefined}>
          <Text numberOfLines={2} style={[s.t1, { color: fg }]}>{bolded(text, { fontFamily: ff("800") })}</Text>
          {!!sub && <Text numberOfLines={2} style={[s.sub, error && { color: "rgba(255,255,255,0.85)" }]}>{bolded(sub, { color: fg })}</Text>}
        </View>
      </View>
      {(!!alt || !!onAction) && (
        <View style={s.row}>
          {alt && <Tap onPress={onAlt} hitSlop={8} style={[s.a, { borderWidth: 1, borderColor: "rgba(127,127,127,0.5)" }]}><Text style={[s.at, { color: fg }]}>{altPlain ? altLabel : t("orWhen", { when: altLabel })}</Text></Tap>}
          {onAction && (
            <Tap onPress={onAction} hitSlop={8} style={[s.a, { backgroundColor: error ? "#fff" : th.bg }]}>
              <Text style={[s.at, { color: bg }]}>{actionLabel ?? t("undo")}</Text>
            </Tap>
          )}
        </View>
      )}
    </Animated.View>
    </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  // ui.css .toast
  drag: { position: "absolute", left: 12, right: 12, zIndex: 30 },
  toast: { flexDirection: "column", gap: 10, paddingVertical: 12, paddingLeft: 18, paddingRight: 12, borderRadius: 24, boxShadow: "0 20px 40px -18px rgba(0,0,0,0.5)" },
  tl: { flexDirection: "row", alignItems: "center", gap: 12 }, // ui.css .toast .tl
  tx: { minWidth: 0, flexShrink: 1 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  t1: { fontSize: font.md, fontFamily: ff("600"), lineHeight: 19.5 }, // the title in it 800 (bolded) // 15px, line-height 1.3
  sub: { marginTop: 1, fontSize: font.label, fontFamily: ff("500"), lineHeight: 19.5, color: "rgb(127,127,127)" },
  a: { height: 40, paddingHorizontal: 13, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  at: { fontSize: font.sub, fontFamily: ff("700") },
});
