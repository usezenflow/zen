import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Extrapolation, FadeOut, interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, ZoomIn, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useDrop } from "@/components/outside";
import { EASE, Hit } from "@/components/tap";
import { t } from "@/lib/i18n";
import { ff, useTheme } from "@/lib/theme";

// views.html .dial: zen's small time drum dropped from its chip like a menu. Three 44px rows, the middle one in a band; minutes step 5.
// Three rows: with five, the hours before today's first (or an end's start) left blank rows above the band.
const ROW = 44, SHOW = 3, COL = 60, SEP = 16, PADX = 12, PADY = 10;
const PRE = 44, PILL = 44, GAP = 8; // the preset row: views.html .pre, one tap picks and closes
const H = SHOW * ROW + 2 * PADY;
const TW = 208; // two presets to a line, each centred with room on both sides
// A start's usual morning, afternoon, after class, evening; a due's before midnight and midnight.
const TPRE: [number, number][] = [[8, 0], [14, 0], [17, 0], [20, 0]], DPRE: [number, number][] = [[23, 59], [0, 0]];
const TH = (n: number) => H + PRE + (Math.ceil(n / 2) - 1) * (PILL + GAP);
const HOURS = Array.from({ length: 24 }, (_, i) => i), MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // any 5p; the presets cover the usual
const pad = (n: number) => String(n).padStart(2, "0");
const tick = () => { Haptics.selectionAsync().catch(() => {}); };

export type Anchor = { x: number; y: number; w: number; h: number };

/** A row of preset pills (views.html .pre). */
function Presets({ items, style, pill }: { items: { label: string; off?: boolean; on?: boolean; onPress: () => void }[]; style?: object; pill?: object }) {
  const th = useTheme();
  return (
    <View style={[s.pre, style]}>
      {items.map((x) => (
        <Hit key={x.label} disabled={x.off} onPress={x.onPress} accessibilityRole="button" accessibilityLabel={x.label} style={[s.pill, pill, { backgroundColor: x.on ? th.ink : th.chip }, x.off && { opacity: 0.4 }]}>
          <Text style={[s.pt, { color: x.on ? th.bg : th.ink }]} numberOfLines={1}>{x.label}</Text>
        </Hit>
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
      // no rotateX: a 3D tilt next to the card's BlurView rendered as hard blurred blocks on iOS
      transform: [{ scale: interpolate(a, [0, 1], [1, 0.96], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[s.cell, st]}>
      <Text style={[s.num, { color: th.ink }]}>{label}</Text>
    </Animated.View>
  );
}

/** One drum. Ticks a light haptic per row passed; `onPick` once it settles on a new row. */
function Drum({ values, start, onPick, fmt = pad }: { values: number[]; start: number; onPick: (v: number) => void; fmt?: (v: number) => string }) {
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
      {values.map((v, i) => <Cell key={v} i={i} y={y} label={fmt(v)} />)}
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

function Clock({ value, due, min, past, presets, onChange, onClose }: { value: Date; due?: boolean; min?: Date; past?: boolean; presets?: Preset[]; onChange: (d: Date) => void; onClose: () => void }) {
  const th = useTheme();
  // On today only now to midnight is offered: an hour once a quarter of it is left, minutes from now on. `past`: any time (a manual edit).
  const [now] = useState(() => new Date(Date.now())); // Date.now, as the calendar: one clock for both
  const today = value.toDateString() === now.toDateString(), nh = now.getHours(), nm = now.getMinutes();
  // The earliest time offered, in minutes of the day: now on today; an end's `min` (its start + 15) on the start's day.
  const floor = Math.max(today && !past ? nh * 60 + nm : -1, min && min.toDateString() === value.toDateString() ? min.getHours() * 60 + min.getMinutes() : -1);
  const minsOf = (h: number) => minutesAt(h, due).filter((m) => h * 60 + m >= floor);
  const open = HOURS.filter((h) => minsOf(h).length);
  const hours = open.length ? open : HOURS; // shortcut: past the day's last step (23:46 for a start) nothing is left today; the whole day shows rather than an empty drum
  const allowed = (h: number) => (open.length ? minsOf(h) : minutesAt(h, due));
  const [first] = useState(() => {
    const h0 = value.getHours(), mm = value.getMinutes();
    const h = hours.includes(h0) ? h0 : hours[0]; // a time already gone starts on the first one left
    const want = h !== h0 ? -1 : due && h === 23 && mm === 59 ? 59 : MINUTES[Math.round(mm / 5) % 12];
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
      <Presets style={s.dpre} pill={s.dpill} items={presets ? presets.map((x) => ({ label: x.label, on: x.on, onPress: () => { onChange(x.at); onClose(); } })) : (due ? DPRE : TPRE).map(([h, m]) => ({ label: `${h}:${pad(m)}`, off: gone(h, m), onPress: () => { const d = new Date(value); d.setHours(h, m, 0, 0); onChange(d); onClose(); } }))} />
    </View>
  );
}

/** Minutes as "45p", "1h", "1h30" (views.html: p/h units). */
export const lenText = (m: number) => (m < 60 ? `${m}p` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`);
const LENS = [15, 30, 45, 60, 90, 120], DRUM = Array.from({ length: 47 }, (_, i) => 15 + i * 5); // the presets; the drum: 15p to 4h in 5s

/** A sitting's length dropped from its chip: a drum of minutes and the usual lengths as presets; a tap outside closes. */
export function LenDrop({ open, anchor, value, side = "right", onChange, onClose }: { open: boolean; anchor?: Anchor; value: number; side?: "left" | "right"; onChange: (m: number) => void; onClose: () => void }) {
  const th = useTheme();
  if (!open || !anchor) return null;
  const start = Math.max(0, Math.min(DRUM.length - 1, Math.round((value - 15) / 5)));
  return (
    <Drop anchor={anchor} w={TW} h={TH(LENS.length)} side={side} onClose={onClose}>
      <View style={s.pad}>
        <View style={[s.band, { backgroundColor: th.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]} />
        <View style={s.row}><Drum values={DRUM} start={start} fmt={lenText} onPick={onChange} /></View>
        <Presets style={s.dpre} pill={s.dpill} items={LENS.map((m) => ({ label: lenText(m), on: m === value, onPress: () => { onChange(m); onClose(); } }))} />
      </View>
    </Drop>
  );
}

export type Preset = { label: string; at: Date; on?: boolean };

/** The time dial under `anchor` (from measureInWindow). Each settled drum calls `onChange`; a tap outside closes. `presets`: replace the usual times (an end offers lengths). */
export function TimeDial({ open, anchor, value, due, min, past, presets, side = "right", onChange, onClose }: { open: boolean; anchor?: Anchor; value: Date; due?: boolean; min?: Date; past?: boolean; presets?: Preset[]; side?: "left" | "right"; onChange: (d: Date) => void; onClose: () => void }) {
  if (!open || !anchor) return null;
  return <Drop anchor={anchor} w={TW} h={TH(presets ? presets.length : (due ? DPRE : TPRE).length)} side={side} onClose={onClose}><Clock value={value} due={due} min={min} past={past} presets={presets} onChange={onChange} onClose={onClose} /></Drop>;
}

// views.html .cal: the month, Monday first, six weeks. Today vermilion, the picked day a filled vermilion circle, days before today or `min` greyed out.
const CW = 322, CELL = 44, CH = 14 + PRE + 10 + 44 + 22 + 6 * CELL + 10;
/** A sitting's day chip: the four parts sit above the month in place of the day presets; a tap on one calls `onPick`. */
export type Parts = { on: number; onPick: (i: number) => void };
const PARTS = ["Sáng", "Trưa", "Chiều", "Tối"];
const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const day0 = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function Month({ value, min, past, parts, onPick }: { value: Date; min?: Date; past?: boolean; parts?: Parts; onPick: (d: Date) => void }) {
  const th = useTheme();
  const [now] = useState(() => Date.now()); // today, as the calendar opened
  const [shown, setShown] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const y = shown.getFullYear(), m = shown.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const sel = day0(value.getTime()), today = day0(now), lo = Math.max(past ? -Infinity : today, min ? day0(min.getTime()) : -Infinity); // never a day already gone, unless `past`
  const step = (k: number) => setShown(new Date(y, m + k, 1));
  const plus = (k: number) => { const d = new Date(today); d.setDate(d.getDate() + k); return d; };
  return (
    <View style={s.cal}>
      {/* one line: three days, or the four parts of a sitting */}
      <Presets style={{ paddingHorizontal: 4, paddingBottom: 10 }} pill={s.cpill} items={parts ? PARTS.map((p, i) => ({ label: p, on: i === parts.on, onPress: () => parts.onPick(i) })) : ([["today", 0], ["tomorrow", 1], ["nextWeek", 7]] as const).map(([k, n]) => ({ label: t(k), off: plus(n).getTime() < lo, onPress: () => onPick(plus(n)) }))} />
      <View style={s.mh}>
        <Text style={[s.mt, { color: th.ink }]}>{`Tháng ${m + 1} ${y}`}</Text>
        <View style={s.arrows}>
          <Hit onPress={() => step(-1)} accessibilityLabel="‹" style={s.arrowB}><Text style={[s.arrow, { color: th.seal }]}>‹</Text></Hit>
          <Hit onPress={() => step(1)} accessibilityLabel="›" style={s.arrowB}><Text style={[s.arrow, { color: th.seal }]}>›</Text></Hit>
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
export function DateDrop({ open, anchor, value, min, past, parts, side = "left", onChange, onClose }: { open: boolean; anchor?: Anchor; value: Date; min?: Date; past?: boolean; parts?: Parts; side?: "left" | "right"; onChange: (d: Date) => void; onClose: () => void }) {
  const win = useWindowDimensions();
  if (!open || !anchor) return null;
  return (
    <Drop anchor={anchor} w={Math.min(CW, win.width - 24)} h={CH} side={side} onClose={onClose}>
      {/* a day whose time is already gone (today) takes the next quarter hour, as the dial does; `past` keeps the time as it is */}
      <Month value={value} min={min} past={past} parts={parts} onPick={(d) => { const n = new Date(value); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); onChange(past ? n : new Date(Math.max(n.getTime(), Math.ceil(Date.now() / 900_000) * 900_000))); onClose(); }} />
    </Drop>
  );
}

const s = StyleSheet.create({
  card: { position: "absolute", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 18px 40px -8px rgba(0,0,0,0.28)" },
  pad: { paddingHorizontal: PADX, paddingVertical: PADY },
  band: { position: "absolute", left: PADX, right: PADX, top: PADY + ((SHOW - 1) / 2) * ROW, height: ROW, borderRadius: 9 },
  cal: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10 },
  mh: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  mt: { fontSize: 17, fontFamily: ff("600") },
  arrows: { flexDirection: "row", gap: 4 },
  arrow: { fontSize: 28, lineHeight: 30, fontFamily: ff("600") },
  arrowB: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  gr: { flexDirection: "row", flexWrap: "wrap" },
  wd: { width: "14.2857%", height: 22, textAlign: "center", fontSize: 13, fontFamily: ff("600") },
  dc: { width: "14.2857%", height: CELL, alignItems: "center", justifyContent: "center" },
  dot: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: "center", justifyContent: "center" },
  dn: { fontSize: 17, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  pre: { flexDirection: "row", gap: GAP, justifyContent: "center" },
  dpre: { paddingTop: 8, flexWrap: "wrap" },
  dpill: { width: (TW - 2 * PADX - GAP) / 2, paddingHorizontal: 0 }, // two to a line, the time centred
  cpill: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  pill: { height: PILL, paddingHorizontal: 10, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  pt: { fontSize: 16, fontFamily: ff("600"), fontVariant: ["tabular-nums"] },
  cell: { height: ROW, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 20, fontFamily: ff("600"), fontVariant: ["tabular-nums"] },
  sep: { width: SEP, textAlign: "center" },
});
