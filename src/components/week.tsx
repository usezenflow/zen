import * as Haptics from "expo-haptics";
import { useEffect, useId, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, Extrapolation, FadeIn, FadeOut, interpolate, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { TypeArt } from "@/components/art";
import { addDays, holLines, keptOn, onDay, short, startOfDay, type Hols } from "@/components/cal";
import { Tap, settle } from "@/components/tap";
import { useTheme, ff, motion } from "@/lib/theme";
import type { Rule, Task } from "@/lib/types";
import { typeOf } from "@/planner";

/** Diagonal hairline stripes (.hb / .hol in ui.css): lines every `gap` px, 1.5px thick. */
export function Stripes({ color, gap = 7 }: { color: string; gap?: number }) {
  const id = useId().replace(/\W/g, "");
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap} patternTransform="rotate(45)">
          <Rect width={1.5} height={gap} fill={color} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const tick = () => void Haptics.selectionAsync().catch(() => {});

/**
 * Horizontal swipe: -1 previous, 1 next. Fails on vertical moves so the page still scrolls.
 * The grid tracks the finger, slides out, and the new page springs in from the far side once `stepKey` changes (as DayPull).
 */
export function Swipe({ onStep, stepKey, children }: { onStep: (d: -1 | 1) => void; stepKey: number; children: ReactNode }) {
  const tx = useSharedValue(0), w = useSharedValue(1);
  useEffect(() => { tx.set(settle(0)); }, [stepKey, tx]);
  const pan = usePanGesture({
    activeOffsetX: [-20, 20],
    failOffsetY: [-14, 14],
    onUpdate: (e) => { "worklet"; tx.set(e.translationX); },
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) <= 50 && Math.abs(e.velocityX) <= 600) { tx.set(settle(0)); return; }
      const d = e.translationX < 0 ? 1 : -1;
      scheduleOnRN(tick);
      tx.set(withTiming(-d * w.get(), { duration: motion.fast, easing: Easing.out(Easing.cubic) }, (ok) => {
        if (!ok) return;
        tx.set(d * w.get() * 0.35); // park on the far side; the stepKey effect springs it home
        scheduleOnRN(onStep, d);
      }));
    },
  });
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }],
    opacity: interpolate(Math.abs(tx.get()), [0, w.get()], [1, 0.3], Extrapolation.CLAMP),
  }));
  return (
    <GestureDetector gesture={pan}>
      <View style={{ overflow: "hidden" }} onLayout={(e) => w.set(e.nativeEvent.layout.width)}>
        <Animated.View style={st}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const AREA = 150, GAP = 3, MINH = 16;
// Fixed-height column (fit() in views.html): blocks compress proportionally; past the minimum height a "+n" chip takes the rest.
function fit(hs: number[]) {
  const cap = Math.floor((AREA + GAP) / (MINH + GAP));
  let more = 0, list = hs;
  if (hs.reduce((a, h) => a + h, 0) + GAP * (hs.length - 1) > AREA && hs.length > cap) { more = hs.length - (cap - 1); list = hs.slice(0, cap - 1); }
  const avail = AREA - GAP * (list.length - 1 + (more ? 1 : 0)) - (more ? MINH : 0);
  const sc = Math.min(1, avail / (list.reduce((a, h) => a + h, 0) || 1));
  return { hs: list.map((h) => Math.max(MINH, Math.floor(h * sc))), more };
}

export function Week({ tasks, hols, monday, selected, now, onSelect, onStep, rules = [] }: { tasks: Task[]; hols: Hols; monday: number; selected: number; now: number; onSelect: (day: number) => void; onStep: (d: -1 | 1) => void; rules?: Rule[] }) {
  const th = useTheme();
  const today = startOfDay(now);
  // A whole empty week keeps its height as dashed slots, so the grid reads as room, not as missing.
  const nil = short.every((_, i) => !hols.has(addDays(monday, i)) && !onDay(tasks, addDays(monday, i)).length);
  return (
    <Swipe onStep={onStep} stepKey={monday}>
      <View style={s.wk}>
        {short.map((d, i) => {
          const day = addDays(monday, i);
          const hol = hols.get(day);
          const on = day === today;
          // Tasks and kept-free rule windows in time order; a rule block is striped and sized like a task of its length.
          const xs: (Task | Rule)[] = hol ? [] : [...onDay(tasks, day), ...keptOn(rules, day)]
            .sort((a, b) => ("text" in a ? day + a.from * 60_000 : a.start!) - ("text" in b ? day + b.from * 60_000 : b.start!));
          const f = fit(xs.map((x) => Math.max(24, Math.min(52, Math.round(("text" in x ? x.to - x.from : (x.end! - x.start!) / 60000) * 0.45)))));
          return (
            <Tap key={day} style={s.c} scale={0.97} onPress={() => onSelect(day)}>
              <View style={[s.d, { borderColor: day === selected && !on ? th.ink : th.line }, on && { backgroundColor: th.ink, borderColor: th.ink }]}>
                <Text style={[s.dl, { color: on ? th.bg : th.muted }]}>{d}</Text>
                <Text style={[s.dn, { color: on ? th.bg : th.ink }]}>{new Date(day).getDate()}</Text>
              </View>
              {nil ? <View style={[s.nil, { borderColor: th.line }]} /> : hol ? (
                <View style={[s.hb, { borderColor: th.line }]}>
                  <Stripes color={th.line} />
                  {holLines(hol).map((l, k) => <Text key={k} numberOfLines={k ? 1 : 3} style={[s.hl, { color: th.muted }]}>{l}</Text>)}
                </View>
              ) : (
                <View style={s.bs}>
                  {f.hs.map((h, j) => {
                    const x = xs[j];
                    return "text" in x ? (
                      <Animated.View key={`k${x.id}`} layout={LinearTransition} entering={FadeIn} exiting={FadeOut} style={[s.b, { height: h, borderWidth: 1, borderColor: th.line }]} accessibilityLabel={x.text}>
                        <Stripes color={th.line} />
                      </Animated.View>
                    ) : (
                      <Animated.View key={x.id} layout={LinearTransition} entering={FadeIn} exiting={FadeOut} style={[s.b, { height: h }]}>
                        <TypeArt type={typeOf(x)} w={40} h={h} seed={j * 3 + h} />
                      </Animated.View>
                    );
                  })}
                  {f.more > 0 && <Animated.View layout={LinearTransition} entering={FadeIn} exiting={FadeOut} style={[s.more, { backgroundColor: th.chip }]}><Text style={[s.mt, { color: th.muted }]}>+{f.more}</Text></Animated.View>}
                </View>
              )}
            </Tap>
          );
        })}
      </View>
    </Swipe>
  );
}

const s = StyleSheet.create({
  wk: { flexDirection: "row", gap: 4, marginTop: 24 },
  c: { flex: 1, gap: 4 },
  d: { height: 52, borderRadius: 99, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  dl: { fontSize: 13, fontFamily: ff("600") },
  dn: { fontSize: 17, fontFamily: ff("800") },
  bs: { height: AREA, gap: GAP },
  b: { borderRadius: 8, overflow: "hidden" },
  more: { height: MINH, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  mt: { fontSize: 12, fontFamily: ff("700") },
  nil: { height: AREA, borderRadius: 10, borderWidth: 1, borderStyle: "dashed" },
  hb: { height: AREA, borderRadius: 10, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 2 },
  hl: { fontSize: 12, fontFamily: ff("700"), textAlign: "center", lineHeight: 15 },
});
