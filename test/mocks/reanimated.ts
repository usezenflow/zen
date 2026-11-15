// What the app uses of react-native-reanimated, without native code: animations land on their end value at once and call their
// callback, styles are computed once per render, layout animations are inert builders. (Reanimated 4.7's own mock needs its native module.)
import { ScrollView, Text, View, FlatList, Image } from "react-native";

type Cb = ((done: boolean) => void) | undefined;
export const withTiming = (to: unknown, _c?: unknown, cb?: Cb) => { cb?.(true); return to; };
export const withSpring = withTiming;
export const withDelay = (_ms: number, v: unknown) => v;
export const withSequence = (...v: unknown[]) => v[v.length - 1];
export const withRepeat = (v: unknown) => v;
export const cancelAnimation = () => {};

export function useSharedValue<T>(init: T) {
  const sv = { value: init, get: () => sv.value, set: (v: T | ((p: T) => T)) => { sv.value = typeof v === "function" ? (v as (p: T) => T)(sv.value) : v; }, modify: (f: (p: T) => T) => { sv.value = f(sv.value); } };
  return sv;
}
export type SharedValue<T> = ReturnType<typeof useSharedValue<T>>;
export const makeMutable = useSharedValue;
export const useAnimatedStyle = (f: () => object) => f();
export const useAnimatedProps = (f: () => object) => f();
export const useDerivedValue = <T,>(f: () => T) => ({ value: f(), get: f });
export const useFrameCallback = () => ({ setActive: () => {}, isActive: false });
export const useAnimatedRef = () => ({ current: null });
// A scroll handler is a plain onScroll: it gets the native event and passes its nativeEvent on.
export const useAnimatedScrollHandler = (h: { onScroll?: (e: unknown) => void } | ((e: unknown) => void)) =>
  (e: { nativeEvent: unknown }) => (typeof h === "function" ? h : h.onScroll)?.(e.nativeEvent);
export const useReducedMotion = () => false;
export const scrollTo = () => {};
export const runOnJS = <F,>(f: F) => f;
export const runOnUI = <F,>(f: F) => f;

export const Extrapolation = { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" } as const;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function interpolate(x: number, input: number[], output: number[], ex?: unknown) {
  let i = 0;
  while (i < input.length - 2 && x > input[i + 1]) i++;
  const t = (x - input[i]) / (input[i + 1] - input[i] || 1);
  const y = output[i] + t * (output[i + 1] - output[i]);
  const shut = ex === "clamp" || (typeof ex === "object" && ex !== null);
  return shut ? clamp(y, Math.min(...output), Math.max(...output)) : y;
}
export const interpolateColor = (_x: number, _i: number[], output: string[]) => output[0];

// Easing.out(Easing.cubic), Easing.bezier(...): any member is a curve maker that returns the identity curve.
const ident = (t: number) => t;
export const Easing: Record<string, (...a: unknown[]) => unknown> = new Proxy({}, { get: () => (..._a: unknown[]) => ident });

// FadeIn.duration(200).delay(40), new Keyframe({...}).duration(300): chainable and inert.
const builder = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "build" ? () => ({}) : () => builder()), apply: () => builder(), construct: () => builder() as object });
export const FadeIn = builder(), FadeInDown = builder(), FadeInUp = builder(), FadeOut = builder(), FadeOutDown = builder(),
  ZoomIn = builder(), ZoomOut = builder(), LinearTransition = builder(), SlideInDown = builder(), SlideOutDown = builder();
export const Keyframe = builder();
export const ReduceMotion = { System: "system", Always: "always", Never: "never" };

const createAnimatedComponent = <C,>(c: C) => c;
const Animated = { View, Text, ScrollView, FlatList, Image, createAnimatedComponent };
export { createAnimatedComponent };
export default Animated;
