import { useEffect, useId, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { enso } from "@/components/enso";
import { useTheme, type TypeName } from "@/lib/theme";
import type { Kind, Task } from "@/lib/types";
import { typeOf } from "@/planner";

export { Icon, type IconName } from "./icons";

// Ensō koi mark (enso.tsx geometry): one brush stroke round a circle, eye knocked out by a mask, dry-brush rings as the mask.
// "color" is the whole mark in koi orange (ui.js LOGO), "line" is the empty-state outline. States: "load" turns the ring one
// revolution per 6s and breathes the stroke (2.1s in/out); "err" tips the ring -24° and fans the tail wider. Reduce Motion holds both.
const EN = enso();
const AG = Animated.createAnimatedComponent(G);
const TIP = Easing.bezier(0.3, 0.7, 0.2, 1), BREATHE = 2100, TURN = 6000;
export function Logo({ size = 40, mode = "color", color = "#000", state }: { size?: number; mode?: "color" | "white" | "mono" | "line"; color?: string; state?: "load" | "err" }) {
  const id = useId().replace(/\W/g, "");
  const reduce = useReducedMotion();
  const ink = mode === "white" ? "#fff" : mode === "color" ? "#ff8a5c" : color; // logo.html LOGO: "color" is the whole koi in brand orange
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
// A reference radial field (centre x,y and radius r as fractions of the box, rotated a degrees and squashed sx,sy in box units) as a
// pixel-unit gradient: native react-native-svg draws nothing for objectBoundingBox radials. The box-unit rotation becomes a matrix in pixels.
const field = (x: number, y: number, ang: number, sx: number, sy: number, r: number, w: number, h: number) => {
  const q = (ang * Math.PI) / 180, co = Math.cos(q), si = Math.sin(q), cx = x * w, cy = y * h;
  const m = [co * sx, si * (h / w) * sx, -si * (w / h) * sy, co * sy];
  return { cx, cy, rx: r * w, ry: r * h, tf: `matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${cx - (m[0] * cx + m[2] * cy)} ${cy - (m[1] * cx + m[3] * cy)})` };
};
// The reference's seeded generator; a module-level closure so the render body never reassigns a variable.
const rng = (seed: number) => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
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

// No scrim, as in the mockup: white text gets its contrast from a text shadow. w/h seed the box until onLayout reports the real size.
// drift (pause it while a menu or search is open: the redraw competes with them): the colour fields flow across the stripes on their own slow loops (6.5s, 9s, 7.5s, never in step) and the stripes crawl one gap every 5s
// (a ripple); Reduce Motion holds everything still. Masks stay fixed and the fields move behind them, so the lines read as lines while the colour moves.
const mv = (dx: number, dy: number) => { "worklet"; return { transform: [{ translateX: dx }, { translateY: dy }] }; }; // runs on the UI thread, so it must be a worklet
const loop = (v: SharedValue<number>, ms: number) => v.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true));
export function TypeArt({ type, w: w0 = 300, h: h0 = 300, seed = 3, dir, drift }: { type: TypeName; w?: number; h?: number; seed?: number; dir?: "h" | "v" | "d"; drift?: boolean }) {
  const reduce = useReducedMotion(), ta = useSharedValue(0.5), tb = useSharedValue(0.5), tc = useSharedValue(0.5), ts = useSharedValue(0);
  useEffect(() => {
    if (!drift || reduce) { ta.set(0.5); tb.set(0.5); tc.set(0.5); ts.set(0); return; }
    // Start once the screen has settled: a view that is mounting or a menu that is opening is animating too, and the redraw would compete with it.
    const go = setTimeout(() => { loop(ta, 6500); loop(tb, 9000); loop(tc, 7500); ts.set(withRepeat(withTiming(1, { duration: 5000, easing: Easing.linear }), -1)); }, 800);
    return () => clearTimeout(go);
  }, [drift, reduce, ta, tb, tc, ts]);
  const { art } = useTheme();
  const id = useId().replace(/\W/g, "");
  const { a, b, c, d } = art[type];
  const [box, setBox] = useState({ w: w0, h: h0 }), { w, h } = box;
  const g = useMemo(() => {
    const r = rng(seed);
    const x1 = 0.25 + r() * 0.5, y1 = 0.3 + r() * 0.4, a1 = r() * 180, x2 = 0.1 + r() * 0.8, y2 = 0.1 + r() * 0.8, a2 = r() * 180;
    const rot = ROT[dir ?? (["h", "v", "d"] as const)[Math.abs(seed) % 3]];
    return { f: field(x1, y1, a1, 1.15, 0.62, 0.55, w, h), k: field(x1, y1, a1, 1.2, 0.55, 0.3, w, h), e: field(x2, y2, a2, 1.3, 0.5, 0.42, w, h), rot };
  }, [type, w, h, seed, dir]);
  // Arrays, not SVG strings: Reanimated parses string transforms as CSS (see Logo).
  const fMove = useAnimatedProps(() => mv((ta.get() - 0.5) * 2 * 0.2 * w, (tb.get() - 0.5) * 2 * 0.14 * h));
  const kMove = useAnimatedProps(() => mv((0.5 - tb.get()) * 2 * 0.18 * w, (tc.get() - 0.5) * 2 * 0.16 * h));
  const eMove = useAnimatedProps(() => mv((tc.get() - 0.5) * 2 * 0.22 * w, (0.5 - ta.get()) * 2 * 0.2 * h));
  const crawl = useAnimatedProps(() => mv(0, ts.get() * GAP));
  // Explicit stripe rects in the mask, not a Pattern: native react-native-svg drops a Pattern fill inside a Mask, which leaves the colour fields unmasked (smooth blobs, no lines).
  const stripes = (t: number) => {
    const D = Math.hypot(w, h), n = Math.ceil(D / GAP);
    return <G transform={`translate(${w / 2} ${h / 2}) rotate(${g.rot})`}><AG animatedProps={crawl}>{Array.from({ length: n + 2 }, (_, k) => <Rect key={k} x={-D / 2} y={-D / 2 + (k - 1) * GAP} width={D} height={t} fill="#fff" />)}</AG></G>;
  };
  const px = w * 0.3, py = h * 0.3; // the moving field rect is oversized so its edge never shows
  const layer = (gid: string, mid: string, move: ReturnType<typeof useAnimatedProps>) => (
    <G mask={`url(#${id}${mid})`}><AG animatedProps={move}><Rect x={-px} y={-py} width={w + 2 * px} height={h + 2 * py} fill={`url(#${id}${gid})`} /></AG></G>
  );
  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (width > 0 && height > 0) setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height })); }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={c} />
        </LinearGradient>
        <RadialGradient id={`${id}f`} gradientUnits="userSpaceOnUse" cx={g.f.cx} cy={g.f.cy} rx={g.f.rx} ry={g.f.ry} gradientTransform={g.f.tf}>
          <Stop offset="0" stopColor={b} /><Stop offset="0.6" stopColor={b} stopOpacity={0.9} /><Stop offset="1" stopColor={b} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}c`} gradientUnits="userSpaceOnUse" cx={g.k.cx} cy={g.k.cy} rx={g.k.rx} ry={g.k.ry} gradientTransform={g.k.tf}>
          <Stop offset="0" stopColor={b} /><Stop offset="0.7" stopColor={b} stopOpacity={0.8} /><Stop offset="1" stopColor={b} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}e`} gradientUnits="userSpaceOnUse" cx={g.e.cx} cy={g.e.cy} rx={g.e.rx} ry={g.e.ry} gradientTransform={g.e.tf}>
          <Stop offset="0" stopColor={d} /><Stop offset="1" stopColor={d} stopOpacity={0} />
        </RadialGradient>
        <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>{stripes(THIN)}</Mask>
        <Mask id={`${id}n`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>{stripes(THICK)}</Mask>
      </Defs>
      <Rect width={w} height={h} fill={`url(#${id}g)`} />
      {layer("e", "m", eMove)}
      {layer("f", "m", fMove)}
      {layer("c", "n", kMove)}
    </Svg>
    </View>
  );
}
