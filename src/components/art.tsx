import { useId, useMemo } from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useTheme, type TypeName } from "@/lib/theme";

export { Icon, type IconName } from "./icons";

// Tea-leaf mark (LOGO in ui.js): a square with two opposite corners turned round, vermilion sun in the open corner.
// "line" is the empty-state outline.
const LEAF = "M12 50A38 38 0 0 1 50 12H74V50A38 38 0 0 1 36 88H12Z";
export function Logo({ size = 40, mode = "color", color = "#000" }: { size?: number; mode?: "color" | "white" | "mono" | "line"; color?: string }) {
  const ink = mode === "white" ? "#fff" : color;
  const sun = mode === "color" || mode === "line" ? "#d9432b" : ink;
  const paint = mode === "line" ? { fill: "none", stroke: ink, strokeWidth: Math.max(3, 140 / size), strokeLinejoin: "round" as const } : { fill: ink };
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={LEAF} {...paint} />
      <Circle cx={84} cy={84} r={size < 24 ? 13 : 11} fill={sun} />
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
