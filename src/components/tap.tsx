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

/** Pressable with iOS press feedback: dips a touch ("pop"), or a soft grey highlight for list rows and menu items ("row"). */
export function Tap({ variant = "pop", scale = 0.96, style, onPressIn, onPressOut, ...rest }: Omit<PressableProps, "style"> & {
  variant?: "pop" | "row"; scale?: number; style?: StyleProp<ViewStyle>;
}) {
  const p = useSharedValue(0);
  const fx = useAnimatedStyle(() => variant === "row"
    ? { backgroundColor: interpolateColor(p.get(), [0, 1], ["rgba(127,127,127,0)", "rgba(127,127,127,0.14)"]) }
    : { opacity: 1 - p.get() * 0.3, transform: [{ scale: 1 - p.get() * (1 - scale) }] });
  return (
    <APressable
      {...rest}
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
