import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Extrapolation, FadeOut, interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, ZoomIn, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useDrop } from "@/components/outside";
import { EASE } from "@/components/tap";
import { t } from "@/lib/i18n";
import { ff, useTheme } from "@/lib/theme";

// views.html .dial: zen's small time drum dropped from its chip like a menu. Five 36px rows, the middle one in a band; minutes step 15.
// Three rows: with five, the hours before today's first (or an end's start) left blank rows above the band.
const ROW = 36, SHOW = 3, COL = 52, SEP = 16, PADX = 12, PADY = 10, BANDX = 12; // BANDX: the band reaches past the digits on both sides
const PRE = 42, PILL = 30, GAP = 6; // the preset row: views.html .pre, one tap picks and closes
const W = 2 * COL + SEP + 2 * PADX, H = SHOW * ROW + 2 * PADY;
const TW = 168; // just past the drums: two presets to a line, each time centred with room on both sides
// A start's usual morning, afternoon, after class, evening; a due's before midnight and midnight.
const TPRE: [number, number][] = [[8, 0], [14, 0], [17, 0], [20, 0]], DPRE: [number, number][] = [[23, 59], [0, 0]];
const TH = (n: number) => H + PRE + (Math.ceil(n / 2) - 1) * (PILL + GAP);
const HOURS = Array.from({ length: 24 }, (_, i) => i), MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, "0");
const tick = () => { Haptics.selectionAsync().catch(() => {}); };

export type Anchor = { x: number; y: number; w: number; h: number };

/** A row of preset pills (views.html .pre). */
function Presets({ items, style, pill }: { items: { label: string; off?: boolean; onPress: () => void }[]; style?: object; pill?: object }) {
  const th = useTheme();
  return (
    <View style={[s.pre, style]}>
      {items.map((x) => (
        <Pressable key={x.label} disabled={x.off} onPress={x.onPress} accessibilityRole="button" accessibilityLabel={x.label} style={[s.pill, pill, { backgroundColor: th.chip }, x.off && { opacity: 0.4 }]}>
          <Text style={[s.pt, { color: th.ink }]} numberOfLines={1}>{x.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Cell({ i, y, label }: { i: number; y: SharedValue<number>; label: string }) {
  const th = useTheme();
  const st = useAnimatedStyle(() => {
    const d = (y.get() - i * ROW) / ROW, a = Math.abs(d);
    return {
      opacity: interpolate(a, [0, 1, 2], [1, 0.5, 0.22], Extrapolation.CLAMP),
      transform: [{ perspective: 300 }, { rotateX: `${Math.max(-60, Math.min(60, d * 24))}deg` }, { scale: interpolate(a, [0, 2], [1, 0.88], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[s.cell, st]}>
      <Text style={[s.num, { color: th.ink }]}>{label}</Text>
    </Animated.View>
  );
}

/** One drum. Ticks a light haptic per row passed; `onPick` once it settles on a new row. */
function Drum({ values, start, onPick }: { values: number[]; start: number; onPick: (v: number) => void }) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(start * ROW), seen = useSharedValue(start);
  const settled = useRef(start);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      y.set(e.contentOffset.y);
      const k = Math.round(e.contentOffset.y / ROW);
      if (k !== seen.get()) { seen.set(k); scheduleOnRN(tick); }
    },
  });
  const land = (off: number) => {
    const k = Math.max(0, Math.min(values.length - 1, Math.round(off / ROW)));
    if (k !== settled.current) { settled.current = k; onPick(values[k]); }
  };
  return (
    <Animated.ScrollView
      ref={ref} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
      snapToInterval={ROW} decelerationRate="fast" contentOffset={{ x: 0, y: start * ROW }}
      onLayout={() => ref.current?.scrollTo({ y: start * ROW, animated: false })} // Android ignores contentOffset
      onMomentumScrollEnd={(e) => land(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => { if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) land(e.nativeEvent.contentOffset.y); }} // let go without a flick: no momentum event follows
      contentContainerStyle={{ paddingVertical: ((SHOW - 1) / 2) * ROW }} style={{ width: COL, height: SHOW * ROW }}
    >
      {values.map((v, i) => <Cell key={v} i={i} y={y} label={pad(v)} />)}
    </Animated.ScrollView>
  );
}

// A due date's 23 also offers :59, the usual "before midnight" (views.html "Detail, due date").
const minutesAt = (h: number, due?: boolean) => (due && h === 23 ? [...MINUTES, 59] : MINUTES);

/** A frosted dropdown (ui.css .menu) hanging 6px under `anchor`, its left or right edge on the chip's; above it when the screen ends first. */
function Drop({ anchor, w, h, side, onClose, children }: { anchor: Anchor; w: number; h: number; side: "left" | "right"; onClose: () => void; children: React.ReactNode }) {
  const th = useTheme();
  const win = useWindowDimensions();
  useDrop();
  const below = anchor.y + anchor.h + 6;
  const top = below + h > win.height - 24 ? Math.max(24, anchor.y - h - 6) : below;
  const left = Math.max(12, Math.min(win.width - w - 12, side === "left" ? anchor.x : anchor.x + anchor.w - w));
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      <Animated.View entering={ZoomIn.duration(180).easing(EASE)} exiting={FadeOut.duration(120)} style={[s.card, { top, left, width: w, height: h, transformOrigin: `${top === below ? "top" : "bottom"} ${side}` }]}>
        <BlurView intensity={60} tint={th.dark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: th.dark ? "rgba(44,44,46,0.78)" : "rgba(250,250,248,0.8)" }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

function Clock({ value, due, min, onChange, onClose }: { value: Date; due?: boolean; min?: Date; onChange: (d: Date) => void; onClose: () => void }) {
  const th = useTheme();
  // On today only now to midnight is offered: an hour once a quarter of it is left, minutes from now on.
  const [now] = useState(() => new Date(Date.now())); // Date.now, as the calendar: one clock for both
  const today = value.toDateString() === now.toDateString(), nh = now.getHours(), nm = now.getMinutes();
  // The earliest time offered, in minutes of the day: now on today; an end's `min` (its start + 15) on the start's day.
  const floor = Math.max(today ? nh * 60 + nm : -1, min && min.toDateString() === value.toDateString() ? min.getHours() * 60 + min.getMinutes() : -1);
  const minsOf = (h: number) => minutesAt(h, due).filter((m) => h * 60 + m >= floor);
  const open = HOURS.filter((h) => minsOf(h).length);
  const hours = open.length ? open : HOURS; // shortcut: past the day's last step (23:46 for a start) nothing is left today; the whole day shows rather than an empty drum
  const allowed = (h: number) => (open.length ? minsOf(h) : minutesAt(h, due));
  const [first] = useState(() => {
    const h0 = value.getHours(), mm = value.getMinutes();
    const h = hours.includes(h0) ? h0 : hours[0]; // a time already gone starts on the first one left
    const want = h !== h0 ? -1 : due && h === 23 && mm === 59 ? 59 : MINUTES[Math.round(mm / 15) % 4];
    const ms = allowed(h);
    return { h, m: ms.includes(want) ? want : ms[0] }; // where the drums start
  });
  const at = useRef({ ...first });
  const [hour, setHour] = useState(first.h);
  const mins = allowed(hour);
  const set = (part: "h" | "m", v: number) => {
    at.current[part] = v;
    if (part === "h") {
      setHour(v);
      const ms = allowed(v);
      if (!ms.includes(at.current.m)) at.current.m = ms.find((m) => m >= at.current.m) ?? ms[ms.length - 1]; // :59 belongs to 23 only; today's hour starts at now
    }
    const d = new Date(value);
    d.setHours(at.current.h, at.current.m, 0, 0);
    onChange(d);
  };
  const gone = (h: number, m: number) => !!open.length && h * 60 + m < floor;
  return (
    <View style={s.pad}>
      <View style={[s.band, { backgroundColor: th.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]} />
      <View style={s.row}>
        <Drum values={hours} start={hours.indexOf(first.h)} onPick={(v) => set("h", v)} />
        <Text style={[s.num, s.sep, { color: th.ink }]}>:</Text>
        {/* keyed by its minutes: gaining or losing :59, or today's first hour, starts the drum again on the current minute */}
        <Drum key={mins.join()} values={mins} start={Math.max(0, mins.indexOf(at.current.m))} onPick={(v) => set("m", v)} />
      </View>
      <Presets style={s.dpre} pill={s.dpill} items={(due ? DPRE : TPRE).map(([h, m]) => ({ label: `${h}:${pad(m)}`, off: gone(h, m), onPress: () => { const d = new Date(value); d.setHours(h, m, 0, 0); onChange(d); onClose(); } }))} />
    </View>
  );
}

/** The time dial under `anchor` (from measureInWindow). Each settled drum calls `onChange`; a tap outside closes. */
export function TimeDial({ open, anchor, value, due, min, side = "right", onChange, onClose }: { open: boolean; anchor?: Anchor; value: Date; due?: boolean; min?: Date; side?: "left" | "right"; onChange: (d: Date) => void; onClose: () => void }) {
  if (!open || !anchor) return null;
  return <Drop anchor={anchor} w={TW} h={TH((due ? DPRE : TPRE).length)} side={side} onClose={onClose}><Clock value={value} due={due} min={min} onChange={onChange} onClose={onClose} /></Drop>;
}

// views.html .cal: the month, Monday first, six weeks. Today vermilion, the picked day a filled vermilion circle, days before today or `min` greyed out.
const CW = 300, CELL = 36, CH = 14 + PRE + 34 + 22 + 6 * (CELL + 4) + 10;
const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const day0 = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function Month({ value, min, onPick }: { value: Date; min?: Date; onPick: (d: Date) => void }) {
  const th = useTheme();
  const [now] = useState(() => Date.now()); // today, as the calendar opened
  const [shown, setShown] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const y = shown.getFullYear(), m = shown.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const sel = day0(value.getTime()), today = day0(now), lo = Math.max(today, min ? day0(min.getTime()) : -Infinity); // never a day already gone
  const step = (k: number) => setShown(new Date(y, m + k, 1));
  const plus = (k: number) => { const d = new Date(today); d.setDate(d.getDate() + k); return d; };
  return (
    <View style={s.cal}>
      <Presets style={{ justifyContent: "flex-start", paddingHorizontal: 4, paddingBottom: 12 }} items={([["today", 0], ["tomorrow", 1], ["nextWeek", 7]] as const).map(([k, n]) => ({ label: t(k), off: plus(n).getTime() < lo, onPress: () => onPick(plus(n)) }))} />
      <View style={s.mh}>
        <Text style={[s.mt, { color: th.ink }]}>{`Tháng ${m + 1} ${y}`}</Text>
        <View style={s.arrows}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityLabel="‹"><Text style={[s.arrow, { color: th.seal }]}>‹</Text></Pressable>
          <Pressable onPress={() => step(1)} hitSlop={10} accessibilityLabel="›"><Text style={[s.arrow, { color: th.seal }]}>›</Text></Pressable>
        </View>
      </View>
      <View style={s.gr}>
        {WEEK.map((w) => <Text key={w} style={[s.wd, { color: th.muted }]}>{w}</Text>)}
        {Array.from({ length: 42 }, (_, i) => {
          const d = new Date(y, m, 1 + i - lead), ts = d.getTime(), out = d.getMonth() !== m, off = ts < lo;
          const on = ts === sel && !out;
          return (
            <Pressable key={i} disabled={off} onPress={() => onPick(d)} style={s.dc} accessibilityLabel={`${d.getDate()}/${d.getMonth() + 1}`} accessibilityState={{ disabled: off, selected: on }}>
              <View style={[s.dot, on && { backgroundColor: th.seal }]}>
                <Text style={[s.dn, { color: on ? "#fff" : out || off ? th.muted : ts === today ? th.seal : th.ink }, (out || off) && { opacity: 0.5 }, (on || ts === today) && { fontFamily: ff("600") }]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The date dropdown under `anchor`: a tap on a day calls `onChange` with that day (the time kept) and closes. */
export function DateDrop({ open, anchor, value, min, side = "left", onChange, onClose }: { open: boolean; anchor?: Anchor; value: Date; min?: Date; side?: "left" | "right"; onChange: (d: Date) => void; onClose: () => void }) {
  if (!open || !anchor) return null;
  return (
    <Drop anchor={anchor} w={CW} h={CH} side={side} onClose={onClose}>
      {/* a day whose time is already gone (today) takes the next quarter hour, as the dial does */}
      <Month value={value} min={min} onPick={(d) => { const n = new Date(value); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); onChange(new Date(Math.max(n.getTime(), Math.ceil(Date.now() / 900_000) * 900_000))); onClose(); }} />
    </Drop>
  );
}

const s = StyleSheet.create({
  card: { position: "absolute", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 18px 40px -8px rgba(0,0,0,0.28)" },
  pad: { paddingHorizontal: PADX, paddingVertical: PADY },
  band: { position: "absolute", left: (TW - W) / 2 + PADX - BANDX, right: (TW - W) / 2 + PADX - BANDX, top: PADY + ((SHOW - 1) / 2) * ROW, height: ROW, borderRadius: 9 },
  cal: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10 },
  mh: { height: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  mt: { fontSize: 17, fontFamily: ff("600") },
  arrows: { flexDirection: "row", gap: 22 },
  arrow: { fontSize: 24, lineHeight: 26, fontFamily: ff("600") },
  gr: { flexDirection: "row", flexWrap: "wrap" },
  wd: { width: "14.2857%", height: 22, textAlign: "center", fontSize: 12, fontFamily: ff("600") },
  dc: { width: "14.2857%", height: CELL + 4, alignItems: "center", justifyContent: "center" },
  dot: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: "center", justifyContent: "center" },
  dn: { fontSize: 17, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  pre: { flexDirection: "row", gap: GAP, justifyContent: "center" },
  dpre: { paddingTop: 8, flexWrap: "wrap" },
  dpill: { width: (TW - 2 * PADX - GAP) / 2, paddingHorizontal: 0 }, // two to a line, the time centred
  pill: { height: PILL, paddingHorizontal: 10, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  pt: { fontSize: 14, fontFamily: ff("600"), fontVariant: ["tabular-nums"] },
  cell: { height: ROW, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 20, fontFamily: ff("600"), fontVariant: ["tabular-nums"] },
  sep: { width: SEP, textAlign: "center" },
});
