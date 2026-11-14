import { useEffect, useId, useMemo } from "react";
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useTheme, type TypeName } from "@/lib/theme";

export { Icon, type IconName } from "./icons";

// Tea-leaf mark (LOGO in ui.js): a square with two opposite corners turned round, vermilion sun in the open corner.
// "line" is the empty-state outline. logo.html states: "load" rocks -5° from the lower tip (12,88) while the sun
// breathes to .82 on one 4.2s ease-in-out cycle; "err" tips the leaf -24° and rolls the sun (-30, 12), eased over .6s.
const LEAF = "M12 50A38 38 0 0 1 50 12H74V50A38 38 0 0 1 36 88H12Z";
const AG = Animated.createAnimatedComponent(G);
const TIP = Easing.bezier(0.3, 0.7, 0.2, 1), HALF = 2100;
export function Logo({ size = 40, mode = "color", color = "#000", state }: { size?: number; mode?: "color" | "white" | "mono" | "line"; color?: string; state?: "load" | "err" }) {
  const ink = mode === "white" ? "#fff" : color;
  const sun = mode === "color" || mode === "line" ? "#d9432b" : ink;
  const paint = mode === "line" ? { fill: "none", stroke: ink, strokeWidth: Math.max(3, 140 / size), strokeLinejoin: "round" as const } : { fill: ink };
  const rot = useSharedValue(0), k = useSharedValue(1), dx = useSharedValue(0), dy = useSharedValue(0);
  useEffect(() => { // Reanimated skips these under Reduce Motion, as the mockup's prefers-reduced-motion does
    const io = Easing.inOut(Easing.ease), t6 = (v: number) => withTiming(v, { duration: 600, easing: TIP });
    if (state === "load") {
      rot.set(withRepeat(withSequence(withTiming(-5, { duration: HALF, easing: io }), withTiming(0, { duration: HALF, easing: io })), -1));
      k.set(withRepeat(withSequence(withTiming(0.82, { duration: HALF, easing: io }), withTiming(1, { duration: HALF, easing: io })), -1));
      dx.set(t6(0)); dy.set(t6(0));
    } else { rot.set(t6(state === "err" ? -24 : 0)); k.set(t6(1)); dx.set(t6(state === "err" ? -30 : 0)); dy.set(t6(state === "err" ? 12 : 0)); }
  }, [state, rot, k, dx, dy]);
  // Arrays, not SVG strings: Reanimated 4.7 parses string transforms as CSS and throws on SVG's rotate(a cx cy).
  const leaf = useAnimatedProps(() => ({ transform: [{ translateX: 12 }, { translateY: 88 }, { rotate: `${rot.get().toFixed(2)}deg` }, { translateX: -12 }, { translateY: -88 }] }));
  const disc = useAnimatedProps(() => ({ transform: [{ translateX: 84 + dx.get() }, { translateY: 84 + dy.get() }, { scale: k.get() }, { translateX: -84 }, { translateY: -84 }] }));
  if (!state) return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={LEAF} {...paint} />
      <Circle cx={84} cy={84} r={size < 24 ? 13 : 11} fill={sun} />
    </Svg>
  );
  return (
    // Native SVG clips at its own box (overflow is ignored): a wider canvas holds the tipped leaf and the rolled sun, margins keep the layout size.
    <Svg width={size * 1.8} height={size * 1.8} viewBox="-40 -40 180 180" style={{ margin: -size * 0.4 }}>
      <AG animatedProps={leaf}><Path d={LEAF} {...paint} /></AG>
      <AG animatedProps={disc}><Circle cx={84} cy={84} r={size < 24 ? 13 : 11} fill={sun} /></AG>
    </Svg>
  );
}

// Raked-sand block art (art() in ui.js): gradient, ripples round a stone. Same seed maths as the JS.
// dir "h" is the mockup's concentric rings. "v" (used for lecture/exam in views.html, not yet in ui.js)
// is parallel vertical rake lines that bend round the stone: shortcut, a guess until the mockup defines it.
export function TypeArt({ type, w = 300, h = 300, seed = 3, dir = "h" }: { type: TypeName; w?: number; h?: number; seed?: number; dir?: "h" | "v" }) {
  const { art } = useTheme();
  const id = useId().replace(/\W/g, "");
  const [d, m, l] = art[type];
  const g = useMemo(() => {
    const sx = w * (0.62 + ((seed * 37) % 30) / 100), sy = h * (0.35 + ((seed * 53) % 40) / 100);
    const R = Math.max(w, h) * 1.3, sr = Math.max(10, Math.min(w, h) * 0.13), step = Math.max(3.5, Math.min(w, h) * 0.035);
    const rings: number[] = [];
    if (dir === "v") for (let x = step / 2; x < w; x += step) rings.push(x);
    else for (let r = sr + step * 1.4; r < R; r += step) rings.push(r);
    return { sx, sy, sr, step, rings };
  }, [w, h, seed, dir]);
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={d} /><Stop offset="0.65" stopColor={m} /><Stop offset="1" stopColor={l} />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill={`url(#a${id})`} />
      <G fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={Math.max(0.6, g.step * 0.22)}>
        {g.rings.map((r) =>
          dir === "v" ? <Path key={r} d={`M${r} 0V${h}`} /> : <Circle key={r} cx={g.sx} cy={g.sy} r={r} />,
        )}
      </G>
      <Circle cx={g.sx} cy={g.sy} r={g.sr} fill={d} fillOpacity={0.85} />
    </Svg>
  );
}
