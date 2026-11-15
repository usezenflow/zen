import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme, motion } from "@/lib/theme";

const CAP_IN = 46; // capsule 54 minus 2px border and 2px padding, top and bottom

/** Capsule meter fill, 0..1: grows from empty on mount, then eases to each new value instead of stepping. */
export function Fill({ p }: { p: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.set(withTiming(p, { duration: motion.progress, easing: Easing.out(Easing.cubic) })); }, [p, v]);
  const st = useAnimatedStyle(() => ({ height: v.get() * CAP_IN }));
  return <Animated.View style={[s.capFill, st]} />;
}

/** Hairline meter (mockups .meterh): solid when sure, dashed and muted when only a guess. */
export function Meter({ v, guess, width }: { v: number; guess?: boolean; width?: number }) {
  const th = useTheme();
  return (
    <View style={[s.track, width ? { width, flex: undefined } : null, guess ? { borderWidth: 1.5, borderStyle: "dashed", borderColor: th.line } : { backgroundColor: th.line }]}>
      <View style={[s.fill, { width: `${Math.round(Math.max(0, Math.min(1, v || 0)) * 100)}%`, backgroundColor: guess ? th.muted : th.ink }]} />
    </View>
  );
}

const s = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 6, overflow: "hidden" },
  capFill: { borderRadius: 7, backgroundColor: "#fff" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6 },
});
