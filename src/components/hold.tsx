import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { Icon, Logo } from "@/components/art";
import { t } from "@/lib/i18n";
import { useTheme, font, ff, motion } from "@/lib/theme";

export type HoldState = "idle" | "listening" | "thinking";

const BTN = 74;

export function Hold({ state, onStart, onEnd, idle = "hold" }: { state: HoldState; onStart: () => void; onEnd: () => void; idle?: "hold" | "holdRule" }) {
  const th = useTheme();
  const live = useSharedValue(1);
  useEffect(() => { live.set(withTiming(state === "listening" ? 1.1 : 1)); }, [state, live]);
  // Thinking: the leaf rocks like a leaf on still water, one breath per cycle. Reanimated skips it under Reduce Motion.
  const rock = useSharedValue(0);
  useEffect(() => {
    rock.set(state === "thinking" ? withRepeat(withSequence(withTiming(-6, { duration: 2100 }), withTiming(0, { duration: 2100 })), -1) : withTiming(0));
  }, [state, rock]);
  const rocking = useAnimatedStyle(() => ({ transform: [{ rotate: `${rock.get()}deg` }] }));
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: live.get() }] }));
  return (
    <View style={s.wrap}>
      <Pressable
        disabled={state === "thinking"}
        onPressIn={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onStart(); }}
        onPressOut={onEnd}
        accessibilityRole="button"
        accessibilityLabel={t(idle)}
      >
        <Animated.View style={[s.halo, scale, { backgroundColor: th.bg }]}>
        <View style={[s.btn, { backgroundColor: th.ink }]}>
          {state === "thinking"
            ? <Animated.View key="leaf" entering={ZoomIn.springify()} exiting={ZoomOut.duration(120)}><Animated.View style={rocking}><Logo size={34} mode="mono" color={th.bg} /></Animated.View></Animated.View>
            : <Animated.View key="mic" entering={ZoomIn.springify()} exiting={ZoomOut.duration(120)}><Icon name="mic" size={28} color={th.bg} /></Animated.View>}
        </View>
        </Animated.View>
      </Pressable>
      <Animated.Text key={state} entering={FadeIn.duration(motion.fast)} style={[s.label, { color: th.muted }]}>{t(state === "idle" ? idle : state)}</Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingBottom: 26, gap: 2 },
  // .hold: 8px bg ring plus soft drop shadow
  halo: { width: BTN + 16, height: BTN + 16, borderRadius: (BTN + 16) / 2, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
  btn: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: font.label, fontFamily: ff("600") },
});
