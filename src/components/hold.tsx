import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { EASE } from "@/components/tap";
import { Icon, Logo } from "@/components/art";
import { t } from "@/lib/i18n";
import { useTheme, font, ff, motion } from "@/lib/theme";

export type HoldState = "idle" | "listening" | "thinking";
/** Where the thumb is while held: on the mic (""), or on one of the two satellites (capture.html). */
export type Aside = "" | "photo" | "type";

const BTN = 74;
const HALO = BTN + 16;
// capture.html: satellites 56px, centres 80px either side of the mic and 85px above it.
export const SAT = 56, SAT_DX = 80, SAT_DY = 85;
const SNAP = 48; // a thumb within this of a satellite's centre picks it

export function Hold({ state, onStart, onEnd, onAside, pinned = "", idle = "hold" }: {
  state: HoldState; onStart: () => void; onEnd: (a: Aside) => void; onAside: (a: Aside) => void;
  /** Keeps the fan open with this satellite lit after release (the photo dropdown). */
  pinned?: Aside; idle?: "hold" | "holdRule";
}) {
  const th = useTheme();
  const [down, setDown] = useState(false);
  const [aside, setAside] = useState<Aside>("");
  const at = useRef({ x: 0, y: 0, a: "" as Aside });
  const lit = aside || pinned;
  const live = useSharedValue(1);
  useEffect(() => { live.set(withTiming(lit ? 0.9 : state === "listening" ? 1.1 : 1)); }, [state, lit, live]);
  // Thinking: the leaf rocks like a leaf on still water, one breath per cycle. Reanimated skips it under Reduce Motion.
  const rock = useSharedValue(0);
  useEffect(() => {
    rock.set(state === "thinking" ? withRepeat(withSequence(withTiming(-6, { duration: 2100 }), withTiming(0, { duration: 2100 })), -1) : withTiming(0));
  }, [state, rock]);
  const rocking = useAnimatedStyle(() => ({ transform: [{ rotate: `${rock.get()}deg` }] }));
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: live.get() }] }));

  const move = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - at.current.x, dy = e.nativeEvent.pageY - at.current.y;
    const near = (sx: number) => Math.hypot(dx - sx, dy + SAT_DY) < SNAP;
    const a: Aside = near(-SAT_DX) ? "photo" : near(SAT_DX) ? "type" : "";
    if (a === at.current.a) return;
    at.current.a = a;
    setAside(a);
    Haptics.selectionAsync().catch(() => {});
    onAside(a);
  };
  const release = () => { const a = at.current.a; at.current.a = ""; setDown(false); setAside(""); onEnd(a); };

  const label = lit === "photo" ? t(pinned ? "photoFrom" : "dropPhoto") : lit === "type" ? t("dropType") : t(state === "idle" ? idle : state);
  const sat = (a: "photo" | "type", side: -1 | 1) => {
    const on = lit === a;
    return (
      <Animated.View key={a} entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(motion.fast)} pointerEvents="none"
        style={[s.sat, { left: HALO / 2 + side * SAT_DX - SAT / 2, top: HALO / 2 - SAT_DY - SAT / 2 }, on ? { backgroundColor: th.ink, borderColor: th.ink, transform: [{ scale: 1.18 }] } : { backgroundColor: th.bg, borderColor: th.line }]}>
        <Icon name={a === "photo" ? "image" : "type"} size={24} color={on ? th.bg : th.ink} />
        <Text style={[s.satLabel, { color: on ? th.ink : th.muted }]}>{t(a === "photo" ? "satPhoto" : "satType")}</Text>
      </Animated.View>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.mic}>
        {(down && state !== "thinking") || pinned ? <>{sat("photo", -1)}{sat("type", 1)}</> : null}
        <View
          onStartShouldSetResponder={() => state !== "thinking" && !pinned}
          onResponderTerminationRequest={() => false} // a list scroll must not steal the hold
          onResponderGrant={(e) => {
            at.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, a: "" };
            setDown(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onStart();
          }}
          onResponderMove={move}
          onResponderRelease={release}
          onResponderTerminate={release}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(idle)}
          // No drag for screen readers: the two other ways are named actions on the same button.
          accessibilityActions={[{ name: "photo", label: t("satPhoto") }, { name: "type", label: t("satType") }]}
          onAccessibilityAction={(e) => onEnd(e.nativeEvent.actionName as Aside)}
        >
          <Animated.View style={[s.halo, scale, { backgroundColor: th.bg }]}>
            <View style={[s.btn, { backgroundColor: lit ? th.chip : th.ink }]}>
              {state === "thinking"
                ? <Animated.View key="leaf" entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)}><Animated.View style={rocking}><Logo size={34} mode="mono" color={th.bg} /></Animated.View></Animated.View>
                : <Animated.View key="mic" entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)}><Icon name="mic" size={28} color={lit ? th.muted : th.bg} /></Animated.View>}
            </View>
          </Animated.View>
        </View>
      </View>
      <Animated.Text key={label} entering={FadeIn.duration(motion.fast)} style={[s.label, { color: th.muted }]}>{label}</Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingBottom: 26, gap: 2 },
  mic: { width: HALO, height: HALO },
  // .hold: 8px bg ring plus soft drop shadow
  halo: { width: HALO, height: HALO, borderRadius: HALO / 2, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
  btn: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: font.label, lineHeight: 20, fontFamily: ff("600") }, // fixed so the mic centre sits 93px up (capture.tsx MIC_Y)
  // .sat in capture.html
  sat: { position: "absolute", width: SAT, height: SAT, borderRadius: SAT / 2, borderWidth: 1, alignItems: "center", justifyContent: "center", boxShadow: "0 12px 24px -14px rgba(0,0,0,0.35)" },
  satLabel: { position: "absolute", top: 62, left: (SAT - 80) / 2, width: 80, textAlign: "center", fontSize: 13, fontFamily: ff("600") },
});
