import { useState } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, interpolateColor, Keyframe, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { motion } from "@/lib/theme";

/** The one motion curve: a quick ease-out, no overshoot. */
export const EASE = Easing.bezier(0.25, 1, 0.5, 1);
/** Eased timing to `v` (snap-backs, settles); callable from worklets. */
export const settle = (v: number, duration = 200) => {
  "worklet";
  return withTiming(v, { duration, easing: EASE });
};

const APressable = Animated.createAnimatedComponent(Pressable);

/** Smallest touch target, in points (Apple HIG 44, Material 48): anything drawn smaller reaches this far by hitSlop. */
export const MIN_HIT = 48;
type Slop = PressableProps["hitSlop"];
/** onLayout + hitSlop for a pressable: pads a small one out to MIN_HIT on each axis, never less than the slop it was given. */
export function useMinHit(given?: Slop, onLayout?: PressableProps["onLayout"]) {
  const [size, setSize] = useState<{ w: number; h: number }>();
  const g = typeof given === "number" ? { top: given, bottom: given, left: given, right: given } : (given ?? {});
  const px = size ? Math.max(0, (MIN_HIT - size.w) / 2) : 0, py = size ? Math.max(0, (MIN_HIT - size.h) / 2) : 0;
  return {
    hitSlop: { top: Math.max(g.top ?? 0, py), bottom: Math.max(g.bottom ?? 0, py), left: Math.max(g.left ?? 0, px), right: Math.max(g.right ?? 0, px) },
    onLayout: ((e) => { const { width: w, height: h } = e.nativeEvent.layout; setSize((o) => (o && o.w === w && o.h === h ? o : { w, h })); onLayout?.(e); }) as NonNullable<PressableProps["onLayout"]>,
  };
}

/** A plain Pressable (no press feedback) whose touch area is at least MIN_HIT, for glyph-sized controls. */
export function Hit({ hitSlop, onLayout, ...rest }: PressableProps) {
  return <Pressable {...rest} {...useMinHit(hitSlop, onLayout)} />;
}

/** Pressable with iOS press feedback: dips a touch ("pop"), a soft grey highlight for list rows and menu items ("row"), or only fades ("fade", settings lines). */
export function Tap({ variant = "pop", scale = 0.96, style, onPressIn, onPressOut, hitSlop, onLayout, ...rest }: Omit<PressableProps, "style"> & {
  variant?: "pop" | "row" | "fade"; scale?: number; style?: StyleProp<ViewStyle>;
}) {
  const hit = useMinHit(hitSlop, onLayout);
  const p = useSharedValue(0);
  const fx = useAnimatedStyle(() => variant === "row"
    ? { backgroundColor: interpolateColor(p.get(), [0, 1], ["rgba(127,127,127,0)", "rgba(127,127,127,0.14)"]) }
    : variant === "fade" ? { opacity: 1 - p.get() * 0.5 }
    : { opacity: 1 - p.get() * 0.3, transform: [{ scale: 1 - p.get() * (1 - scale) }] });
  return (
    <APressable
      {...rest}
      {...hit}
      style={[style, fx]}
      onPressIn={(e) => { p.set(withTiming(1, { duration: 90 })); onPressIn?.(e); }}
      onPressOut={(e) => { p.set(settle(0, 140)); onPressOut?.(e); }}
    />
  );
}

/** Shared layout animations: `glide` moves siblings when something above mounts or leaves, `popIn` lands a new card. */
export const glide = LinearTransition.duration(220).easing(EASE);
export const popIn = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE } }).duration(200);
export const fadeIn = FadeIn.duration(motion.fast);
export const fadeOut = FadeOut.duration(120);
