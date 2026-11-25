import { useEffect, useId, useMemo } from "react";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { enso } from "@/components/enso";
import { useTheme, type TypeName } from "@/lib/theme";
import type { Kind, Task } from "@/lib/types";
import { typeOf } from "@/planner";

export { Icon, type IconName } from "./icons";

// Ensō koi mark (enso.tsx geometry): one brush stroke round a circle, eye knocked out by a mask, dry-brush rings as the mask.
// "color" puts the vermilion accent on the split tail, "line" is the empty-state outline. States: "load" turns the ring one
// revolution per 6s and breathes the stroke (2.1s in/out); "err" tips the ring -24° and fans the tail wider. Reduce Motion holds both.
const EN = enso();
const AG = Animated.createAnimatedComponent(G);
const TIP = Easing.bezier(0.3, 0.7, 0.2, 1), BREATHE = 2100, TURN = 6000;
export function Logo({ size = 40, mode = "color", color = "#000", state }: { size?: number; mode?: "color" | "white" | "mono" | "line"; color?: string; state?: "load" | "err" }) {
  const id = useId().replace(/\W/g, "");
  const reduce = useReducedMotion();
  const ink = mode === "white" ? "#fff" : color;
  const accent = mode === "color" ? "#ff8a5c" : ink; // koi orange, the brand accent
  const line = mode === "line";
  const paint = line ? { fill: "none", stroke: ink, strokeWidth: Math.max(3, 140 / size), strokeLinejoin: "round" as const } : { fill: ink };
  const tail = line ? paint : { fill: accent };
  const rot = useSharedValue(0), breathe = useSharedValue(1), spread = useSharedValue(0);
  useEffect(() => { // the mockup's prefers-reduced-motion: the ring and the breath hold still, the tail still moves
    const io = Easing.inOut(Easing.ease), t6 = (v: number) => withTiming(v, { duration: 600, easing: TIP });
    if (state === "load") {
      if (!reduce) {
        rot.set(withRepeat(withTiming(360, { duration: TURN, easing: Easing.linear }), -1));
        breathe.set(withRepeat(withSequence(withTiming(0.97, { duration: BREATHE, easing: io }), withTiming(1, { duration: BREATHE, easing: io })), -1));
      }
      spread.set(t6(0));
    } else if (state === "err") { rot.set(t6(-24)); breathe.set(t6(1)); spread.set(t6(12)); }
  }, [state, reduce, rot, breathe, spread]);
  // Arrays, not SVG strings: Reanimated 4.7 parses string transforms as CSS and throws on SVG's rotate(a cx cy).
  const ring = useAnimatedProps(() => ({ transform: [{ translateX: 50 }, { translateY: 50 }, { rotate: `${rot.get().toFixed(2)}deg` }, { translateX: -50 }, { translateY: -50 }] }));
  const inkBreathe = useAnimatedProps(() => ({ transform: [{ translateX: 50 }, { translateY: 50 }, { scale: breathe.get() }, { translateX: -50 }, { translateY: -50 }] }));
  const [px, py] = EN.pivot;
  const tailUp = useAnimatedProps(() => ({ transform: [{ translateX: px }, { translateY: py }, { rotate: `${spread.get().toFixed(2)}deg` }, { translateX: -px }, { translateY: -py }] }));
  const tailLo = useAnimatedProps(() => ({ transform: [{ translateX: px }, { translateY: py }, { rotate: `${(-spread.get()).toFixed(2)}deg` }, { translateX: -px }, { translateY: -py }] }));
  const animated = !!state;
  // Native SVG clips at its own box (overflow is ignored): the animated canvas is wider, margins keep the layout size.
  const box = animated ? size * 1.8 : size, vb = animated ? "-40 -40 180 180" : "0 0 100 100";
  const [ex, ey] = EN.eye;
  return (
    <Svg width={box} height={box} viewBox={vb} style={animated ? { margin: -size * 0.4 } : undefined}>
      {!line && <Defs>
        <Mask id={`m${id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
          <G fill="none" stroke="#fff" strokeWidth={Math.max(EN.lw, 40 / size)}>
            {EN.rings.map((r) => <Circle key={r} cx={50} cy={50} r={r} />)}
          </G>
          <Circle cx={ex} cy={ey} r={2.4} fill="#000" />
        </Mask>
      </Defs>}
      <AG animatedProps={ring}>
        <G mask={line ? undefined : `url(#m${id})`}>
          <AG animatedProps={inkBreathe}>
            <Path d={EN.body} {...paint} />
            <Path d={EN.head} {...paint} />
          </AG>
          <AG animatedProps={tailUp}><Path d={EN.tailUp} {...tail} /></AG>
          <AG animatedProps={tailLo}><Path d={EN.tailLo} {...tail} /></AG>
        </G>
        {line && <Circle cx={ex} cy={ey} r={2.8} fill={ink} />}
      </AG>
    </Svg>
  );
}

// Line-field block art (art() in the reference): a calm two-stop ground, two radial colour fields seen through stripe
// masks (thin lines over the whole field, thick lines at the core). Seeded maths and stripe sizes match the reference.
// shortcut: the reference's direction h/v/d is chosen per seed when no dir is given; stripes use fixed user units.
const GAP = 4.2, THIN = 1.5, THICK = 3.1, ROT = { h: 0, v: 90, d: 62 } as const;
const xf = (x: number, y: number, ang: number, sx: number, sy: number) => `translate(${x} ${y}) rotate(${ang}) scale(${sx} ${sy}) translate(${-x} ${-y})`;
// The reference's seeded generator; a module-level closure so the render body never reassigns a variable.
const rng = (seed: number) => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
// Hex mix: t of the way from x to y. Pulls the light ground stops toward the field colour under white text.
const mixHex = (x: string, y: string, t: number) => "#" + [1, 3, 5].map((i) => {
  const p = parseInt(x.slice(i, i + 2), 16), q = parseInt(y.slice(i, i + 2), 16);
  return Math.round(p + (q - p) * t).toString(16).padStart(2, "0");
}).join("");
// Palette per task, so a normal day shows several arts: timetable rows keep their own look, prep follows its exam, a due task picks clay or dusk by course, the rest by kind.
// shortcut: the course hash is a plain string hash (no stable course code upstream), so a course's colour may shift if its name changes.
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const seedOf = (id: string) => (hash(id) % 997) + 1; // stable per task: same kind, different field position and direction
const KIND_ART: Record<Kind, TypeName> = { study: "plan", work: "night", exercise: "lecture", chores: "exam", social: "assignment", self: "clay", errand: "exam", finance: "night", other: "clay" };
export function artOf(t: Task): TypeName {
  if (t.fixed === "lecture") return "lecture";
  if (t.fixed === "exam") return "assignment";
  if (t.fixed === "busy") return "busy";
  if (t.forId) return "assignment"; // prep: its exam's palette
  if (typeOf(t) === "assignment") return hash(t.course ?? t.id) % 2 ? "clay" : "assignment";
  return KIND_ART[t.kind];
}

// text: the card carries white text. Ground stops move only 15% toward the field so the colour stays bright; the local scrim carries the contrast.
export function TypeArt({ type, w = 300, h = 300, seed = 3, dir, text }: { type: TypeName; w?: number; h?: number; seed?: number; dir?: "h" | "v" | "d"; text?: boolean }) {
  const { art } = useTheme();
  const id = useId().replace(/\W/g, "");
  const { a: a0, b, c: c0, d } = art[type];
  const a = text ? mixHex(a0, b, 0.15) : a0, c = text ? mixHex(c0, b, 0.15) : c0;
  const g = useMemo(() => {
    const r = rng(seed);
    const x1 = 0.25 + r() * 0.5, y1 = 0.3 + r() * 0.4, a1 = r() * 180, x2 = 0.1 + r() * 0.8, y2 = 0.1 + r() * 0.8, a2 = r() * 180;
    const rot = ROT[dir ?? (["h", "v", "d"] as const)[Math.abs(seed) % 3]];
    return { x1, y1, x2, y2, f: xf(x1, y1, a1, 1.15, 0.62), k: xf(x1, y1, a1, 1.2, 0.55), e: xf(x2, y2, a2, 1.3, 0.5), rot };
  }, [type, w, h, seed, dir]);
  const stripe = (sid: string, t: number) => (
    <Pattern id={sid} x={0} y={0} width={GAP} height={GAP} patternUnits="userSpaceOnUse" patternTransform={`rotate(${g.rot})`}>
      <Rect width={GAP} height={t} fill="#fff" />
    </Pattern>
  );
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={c} />
        </LinearGradient>
        <RadialGradient id={`${id}f`} cx={g.x1} cy={g.y1} r={0.55} gradientTransform={g.f}>
          <Stop offset="0" stopColor={b} /><Stop offset="0.6" stopColor={b} stopOpacity={0.9} /><Stop offset="1" stopColor={b} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}c`} cx={g.x1} cy={g.y1} r={0.3} gradientTransform={g.k}>
          <Stop offset="0" stopColor={b} /><Stop offset="0.7" stopColor={b} stopOpacity={0.8} /><Stop offset="1" stopColor={b} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}e`} cx={g.x2} cy={g.y2} r={0.42} gradientTransform={g.e}>
          <Stop offset="0" stopColor={d} /><Stop offset="1" stopColor={d} stopOpacity={0} />
        </RadialGradient>
        {stripe(`${id}p`, THIN)}{stripe(`${id}q`, THICK)}
        <Mask id={`${id}m`}><Rect width={w} height={h} fill={`url(#${id}p)`} /></Mask>
        <Mask id={`${id}n`}><Rect width={w} height={h} fill={`url(#${id}q)`} /></Mask>
        {/* the scrim: a vertical shade under white text (top .30, bottom .42 with text); without text a light touch */}
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={text ? 0.24 : 0.12} /><Stop offset="0.3" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.6" stopColor="#000" stopOpacity={0} /><Stop offset="1" stopColor="#000" stopOpacity={text ? 0.26 : 0.28} />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill={`url(#${id}g)`} />
      <Rect width={w} height={h} fill={`url(#${id}e)`} mask={`url(#${id}m)`} />
      <Rect width={w} height={h} fill={`url(#${id}f)`} mask={`url(#${id}m)`} />
      <Rect width={w} height={h} fill={`url(#${id}c)`} mask={`url(#${id}n)`} />
      <Rect width={w} height={h} fill={`url(#${id}s)`} />
    </Svg>
  );
}
