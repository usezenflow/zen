import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme, motion } from "@/lib/theme";

const MIN = 12; // a started fill is never thinner than the capsule is wide, so it reads as a rounded pill, not a flat sliver

/** Capsule meter fill, 0..1: grows from empty on mount, then eases to each new value instead of stepping. `inner`: the capsule's inner height (its height minus border and padding, top and bottom). */
export function Fill({ p, inner = 46 }: { p: number; inner?: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.set(withTiming(p, { duration: motion.progress, easing: Easing.out(Easing.cubic) })); }, [p, v]);
  const st = useAnimatedStyle(() => ({ height: v.get() > 0.001 ? Math.max(MIN, v.get() * inner) : 0 }));
  return <Animated.View style={[s.capFill, st]} />;
}

/** Hairline meter (mockups .meterh): solid when sure, dashed and muted when only a guess. Eases to each new value. */
export function Meter({ v, guess, width }: { v: number; guess?: boolean; width?: number }) {
  const th = useTheme();
  const w = useSharedValue(0), p = Math.max(0, Math.min(1, v || 0));
  useEffect(() => { w.set(withTiming(p, { duration: motion.progress, easing: Easing.out(Easing.cubic) })); }, [p, w]);
  const st = useAnimatedStyle(() => ({ width: `${Math.round(w.get() * 100)}%` }));
  return (
    <View style={[s.track, width ? { width, flex: undefined } : null, guess ? { borderWidth: 1.5, borderStyle: "dashed", borderColor: th.line } : { backgroundColor: th.line }]}>
      <Animated.View style={[s.fill, st, { backgroundColor: guess ? th.muted : th.ink }]} />
    </View>
  );
}

const s = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 6, overflow: "hidden" },
  capFill: { borderRadius: 99, backgroundColor: "#fff" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6 },
});
