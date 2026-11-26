import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { EASE } from "@/components/tap";
import { Icon, Logo } from "@/components/art";
import { t } from "@/lib/i18n";
import { useTheme, font, ff, motion } from "@/lib/theme";

export type HoldState = "idle" | "listening" | "thinking";
/** Where the thumb is while held: on the mic (""), or on one of the three satellites (capture.html). */
export type Aside = "" | "photo" | "pdf" | "type";

const BTN = 74;
const HALO = BTN + 16;
// capture.html: satellites 56px, centres 80px either side of the mic and 85px above it; PDF straight up at the same ~117px reach.
export const SAT = 56, SAT_DX = 80, SAT_DY = 85, SAT_UP = 117;
const SNAP = 48; // a thumb within this of a satellite's centre picks it
const FINGER = 38, REACH = 200; // capture.html .finger; the trail canvas spans this far from the mic
const ALine = Animated.createAnimatedComponent(Line);

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
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: live.get() }] }));

  // capture.html .finger and .trail: the thumb and a dashed pull line from the mic, once it leaves the button.
  const fx = useSharedValue(0), fy = useSharedValue(0);
  const away = (x: number, y: number) => { "worklet"; return Math.hypot(x, y) > BTN / 2; };
  const fingerSt = useAnimatedStyle(() => ({ opacity: away(fx.get(), fy.get()) ? 1 : 0, transform: [{ translateX: fx.get() }, { translateY: fy.get() }] }));
  const trailProps = useAnimatedProps(() => ({ x2: REACH + fx.get(), y2: REACH + fy.get(), strokeOpacity: away(fx.get(), fy.get()) ? 1 : 0 }));

  const move = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - at.current.x, dy = e.nativeEvent.pageY - at.current.y;
    fx.set(dx); fy.set(dy);
    const near = (sx: number, sy: number) => Math.hypot(dx - sx, dy + sy) < SNAP;
    const a: Aside = near(-SAT_DX, SAT_DY) ? "photo" : near(0, SAT_UP) ? "pdf" : near(SAT_DX, SAT_DY) ? "type" : "";
    if (a === at.current.a) return;
    at.current.a = a;
    setAside(a);
    Haptics.selectionAsync().catch(() => {});
    onAside(a);
  };
  const release = () => { fx.set(0); fy.set(0); const a = at.current.a; at.current.a = ""; setDown(false); setAside(""); onEnd(a); };

  const label = lit === "photo" ? t(pinned ? "photoFrom" : "dropPhoto") : lit === "pdf" ? t("dropPdf") : lit === "type" ? t("dropType") : t(state === "idle" ? idle : state);
  const SATS = { photo: { icon: "image", name: "satPhoto", x: -SAT_DX, y: SAT_DY }, pdf: { icon: "pdf", name: "satPdf", x: 0, y: SAT_UP }, type: { icon: "type", name: "satType", x: SAT_DX, y: SAT_DY } } as const;
  const sat = (a: Exclude<Aside, "">) => {
    const { icon, name, x, y } = SATS[a];
    const on = lit === a;
    return (
      <Animated.View key={a} entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(motion.fast)} pointerEvents="none"
        style={[s.sat, { left: HALO / 2 + x - SAT / 2, top: HALO / 2 - y - SAT / 2 }, on ? { backgroundColor: th.ink, borderColor: th.ink, transform: [{ scale: 1.18 }] } : { backgroundColor: th.bg, borderColor: th.line }]}>
        <Icon name={icon} size={24} w={1.8} color={on ? th.bg : th.ink} />
        <Text style={[s.satLabel, { color: on ? th.ink : th.muted }]} numberOfLines={1}>{t(name)}</Text>
      </Animated.View>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.mic}>
        {pinned && !down ? <>{sat("photo")}{sat("pdf")}{sat("type")}</> : null}
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
          // No drag for screen readers: the three other ways are named actions on the same button.
          accessibilityActions={[{ name: "photo", label: t("satPhoto") }, { name: "pdf", label: t("satPdf") }, { name: "type", label: t("satType") }]}
          onAccessibilityAction={(e) => onEnd(e.nativeEvent.actionName as Aside)}
        >
          <Animated.View style={[s.halo, scale, { backgroundColor: th.bg }]}>
            <View style={[s.btn, { backgroundColor: lit ? th.chip : th.ink }]}>
              {state === "thinking"
                ? <Animated.View key="leaf" entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)}><Logo size={34} mode="mono" color={th.bg} state="load" /></Animated.View>
                : <Animated.View key="mic" entering={ZoomIn.duration(180).easing(EASE)} exiting={ZoomOut.duration(120)}><Icon name="mic" size={28} color={lit ? th.muted : th.bg} /></Animated.View>}
            </View>
          </Animated.View>
        </View>
        {down && state !== "thinking" && <>
          <Svg pointerEvents="none" width={REACH * 2} height={REACH * 2} style={s.trail}>
            <ALine x1={REACH} y1={REACH} animatedProps={trailProps} stroke={th.muted} strokeWidth={1.5} strokeDasharray="3 5" strokeLinecap="round" />
          </Svg>
          {sat("photo")}{sat("pdf")}{sat("type")}
          <Animated.View pointerEvents="none" style={[s.finger, fingerSt]} />
        </>}
      </View>
      <Animated.Text key={label} entering={FadeIn.duration(motion.fast)} style={[s.label, { color: th.muted }]}>{label}</Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingBottom: 26, gap: 2 },
  mic: { width: HALO, height: HALO },
  // .hold: 8px bg ring, then 0 18px 30px -12px rgba(0,0,0,.35) off the 74px button (spread -20 off the 90px ring)
  halo: { width: HALO, height: HALO, borderRadius: HALO / 2, alignItems: "center", justifyContent: "center", boxShadow: "0 18px 30px -20px rgba(0,0,0,0.35)" },
  btn: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: font.label, lineHeight: 20, fontFamily: ff("500") }, // fixed so the mic centre sits 93px up (capture.tsx MIC_Y)
  // .sat in capture.html
  sat: { position: "absolute", width: SAT, height: SAT, borderRadius: SAT / 2, borderWidth: 1, alignItems: "center", justifyContent: "center", boxShadow: "0 12px 24px -14px rgba(0,0,0,0.35)" },
  trail: { position: "absolute", left: HALO / 2 - REACH, top: HALO / 2 - REACH },
  finger: { position: "absolute", left: HALO / 2 - FINGER / 2, top: HALO / 2 - FINGER / 2, width: FINGER, height: FINGER, borderRadius: FINGER / 2, backgroundColor: "rgba(127,127,127,0.22)", borderWidth: 1.5, borderColor: "rgba(127,127,127,0.45)" },
  satLabel: { position: "absolute", top: 62, left: (SAT - 80) / 2, width: 80, textAlign: "center", fontSize: 13, fontFamily: ff("600") },
});
