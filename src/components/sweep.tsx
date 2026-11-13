import { createContext, useContext, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Image, Mask, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { scheduleOnRN } from "react-native-worklets";

type Run = (pageX: number, pageY: number, apply: () => void) => void;
const Ctx = createContext<Run>((_x, _y, apply) => apply());
const Hole = Animated.createAnimatedComponent(Circle);

/** Inside <Sweep>: `useSweep()(pageX, pageY, apply)` grows a circle from the tap, revealing the screen after `apply`. */
export const useSweep = () => useContext(Ctx);

/** Wraps one screen (a modal is its own native view, so the sweep lives inside the screen it covers). */
export function Sweep({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const root = useRef<ComponentRef<typeof View>>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState<{ uri: string; x: number; y: number; apply: () => void }>();
  const r = useSharedValue(0);
  const hole = useAnimatedProps(() => ({ r: r.get() }));

  const run: Run = (pageX, pageY, apply) => {
    if (shot || !root.current) return apply();
    root.current.measureInWindow(async (ox: number, oy: number) => {
      try {
        const uri = await captureRef(root as never, { format: "png", result: "tmpfile" });
        r.set(0);
        setShot({ uri, x: pageX - ox, y: pageY - oy, apply });
      } catch {
        apply(); // no snapshot: switch without the sweep
      }
    });
  };
  // The old screen is painted on top first; only then switch underneath and open the hole.
  const loaded = () => {
    if (!shot) return;
    shot.apply();
    const far = Math.hypot(Math.max(shot.x, size.w - shot.x), Math.max(shot.y, size.h - shot.y));
    r.set(withTiming(far, { duration: 600, easing: Easing.inOut(Easing.cubic) }, (done) => { if (done) scheduleOnRN(setShot, undefined); }));
  };

  return (
    <Ctx.Provider value={run}>
      <View ref={root} collapsable={false} style={[s.fill, style]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {children}
        {shot && (
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Mask id="sweep">
                <Rect width={size.w} height={size.h} fill="white" />
                <Hole cx={shot.x} cy={shot.y} fill="black" animatedProps={hole} />
              </Mask>
            </Defs>
            <Image href={{ uri: shot.uri }} width={size.w} height={size.h} preserveAspectRatio="none" mask="url(#sweep)" onLoad={loaded} />
          </Svg>
        )}
      </View>
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({ fill: { flex: 1 } });
