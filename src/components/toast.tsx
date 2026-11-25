import { bolded } from "@/components/bold";
import { Logo, TypeArt } from "@/components/art";
import type { TypeName } from "@/lib/theme";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, FadeInDown, Keyframe, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { EASE, settle, Tap } from "@/components/tap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/lib/i18n";
import { useTheme, ff } from "@/lib/theme";

// Lift-out stays a short fade and drift; the drop-in is a light spring.
const toastOut = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] }, 100: { opacity: 0, transform: [{ translateY: -6 }, { scale: 0.98 }], easing: EASE } }).duration(150);

// The leading tile is the koi on the art field of what the toast is about: the task's own palette (artOf) when a caller passes
// `art`; a toast with no task (backup, disconnect, error) rotates through the palettes by a stable hash of its text, errors use clay.
const ROTATE: TypeName[] = ["plan", "night", "lecture", "exam", "assignment", "clay"];
const hashText = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function artFor(text: string, error?: boolean, art?: TypeName): TypeName {
  return art ?? (error ? "clay" : ROTATE[hashText(text) % ROTATE.length]);
}

/**
 * The iOS banner of the reference (.nt): a frosted card with the situational tile at left, the sender "zen" over the message, and a row of
 * equal pill actions below. The 36px tile (radius 9) is the white koi on an art field (`artFor`; `art` overrides it with the task's palette).
 * The alternative slot is a pill left of the action ("hoặc T7 09:00"); `altPlain`: an action of its own ("Xem"), no "hoặc".
 * Swipe it up or sideways to put it away (`onDismiss`); `ms` runs a hairline countdown over the auto-dismiss time.
 * `error`: a small red dot on the sender line only. `lead`: drawn left of the text instead of the tile (the update download's ring).
 */
export function Toast({ text, sub, onAction, actionLabel, onAlt, altLabel, altPlain, error, onDismiss, lead, art, ms }: {
  text: string; sub?: string; onAction?: () => void; actionLabel?: string; onAlt?: () => void; altLabel?: string; altPlain?: boolean; error?: boolean; onDismiss?: () => void; lead?: ReactNode;
  art?: TypeName; ms?: number;
}) {
  const th = useTheme();
  const tileArt = artFor(text, error, art);
  const top = useSafeAreaInsets().top - 8; // .toast top 46 against the mockup's 54 content top
  const alt = onAlt && altLabel;
  const x = useSharedValue(0), y = useSharedValue(0), left = useSharedValue(1);
  useEffect(() => { if (ms) left.set(withTiming(0, { duration: ms, easing: Easing.linear })); }, [ms, left]);
  const bar = useAnimatedStyle(() => ({ width: `${left.get() * 100}%` }));
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
  const card = th.dark ? "rgba(38,40,44,0.96)" : "rgba(244,245,246,0.96)";
  const pill = th.dark ? "#3a3d43" : "#ffffff";
  return (
    <GestureDetector gesture={pan}>
    <Animated.View style={[s.drag, { top }, drag]}>
    <Animated.View entering={FadeInDown.springify().damping(18).stiffness(200)} exiting={toastOut} style={[s.toast, { backgroundColor: card }]}>
      <View style={s.tl}>
        {lead ?? <View style={s.tile}>
          <View style={StyleSheet.absoluteFill}><TypeArt type={tileArt} w={36} h={36} seed={4} /></View>
          <Logo size={22} mode="white" />
        </View>}
        <View style={s.tx} accessibilityRole={error ? "alert" : undefined}>
          <View style={s.senderRow}>
            {!!error && <View style={s.errDot} />}
            <Text style={[s.sender, { color: error ? "#d2492f" : th.ink }]}>zen</Text>
          </View>
          <Text numberOfLines={2} style={[s.msg, { color: th.ink }]}>{bolded(text, { fontFamily: ff("500") })}</Text>
          {!!sub && <Text numberOfLines={2} style={[s.sub, { color: th.muted }]}>{bolded(sub, { color: th.ink, fontFamily: ff("500") })}</Text>}
        </View>
      </View>
      {(!!alt || !!onAction) && (
        <View style={s.row}>
          {alt && <Tap onPress={onAlt} hitSlop={8} style={[s.a, { backgroundColor: pill }]}><Text numberOfLines={1} style={[s.at, { color: th.ink }]}>{altPlain ? altLabel : t("orWhen", { when: altLabel })}</Text></Tap>}
          {onAction && (
            <Tap onPress={onAction} hitSlop={8} style={[s.a, { backgroundColor: pill }]} accessibilityRole="button">
              <Text numberOfLines={1} style={[s.at, { color: th.ink }]}>{actionLabel ?? t("undo")}</Text>
            </Tap>
          )}
        </View>
      )}
      {!!ms && <View style={s.track} pointerEvents="none"><Animated.View style={[s.fill, { backgroundColor: th.dark ? "rgba(242,243,245,0.2)" : "rgba(13,13,15,0.2)" }, bar]} /></View>}
    </Animated.View>
    </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  // ui.css .nt: a frosted card, radius 24, soft shadow, padding 12-14
  drag: { position: "absolute", left: 12, right: 12, zIndex: 30 },
  toast: { flexDirection: "column", gap: 12, paddingTop: 12, paddingBottom: 12, paddingLeft: 12, paddingRight: 12, borderRadius: 24, overflow: "hidden", boxShadow: "0 20px 40px -18px rgba(0,0,0,0.45)" },
  tl: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tile: { width: 36, height: 36, borderRadius: 9, overflow: "hidden", alignItems: "center", justifyContent: "center" }, // the art field with the koi
  tx: { flex: 1, minWidth: 0, paddingTop: 1 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#d2492f" },
  sender: { fontSize: 14, lineHeight: 18, fontFamily: ff("500") },
  msg: { marginTop: 2, fontSize: 14.5, lineHeight: 20, fontFamily: ff("500") },
  sub: { marginTop: 2, fontSize: 14, lineHeight: 19, fontFamily: ff("400") },
  row: { flexDirection: "row", gap: 8 },
  a: { flex: 1, minWidth: 0, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  at: { fontSize: 15, lineHeight: 20, fontFamily: ff("600") },
  track: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  fill: { height: 2 },
});
