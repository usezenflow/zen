import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeOut, ZoomIn, useSharedValue } from "react-native-reanimated";
import { GestureHandlerRootView, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useDrop } from "@/components/outside";
import { EASE, Hit } from "@/components/tap";
import { t } from "@/lib/i18n";
import { ff, useTheme } from "@/lib/theme";

// views.html .dial: zen's round time dial dropped from its chip like a menu. A header HH:MM (tap a segment to switch), then a face: hours first, then minutes in 5p stops.
const PADX = 12, PADY = 10;
const PRE = 44, PILL = 44, GAP = 8; // the preset row: views.html .pre, one tap picks and closes
const TW = 208; // two presets to a line, each centred with room on both sides
const HEAD = 44, FACE = 184, C = FACE / 2, RO = 76, RI = 48; // the face: outer ring 1-12 (stops 00-55 for minutes), inner ring 13-23 and 00
// A start's usual morning, afternoon, after class, evening; a due's before midnight and midnight.
const TPRE: [number, number][] = [[8, 0], [14, 0], [17, 0], [20, 0]], DPRE: [number, number][] = [[23, 59], [0, 0]];
const TH = (n: number) => 2 * PADY + HEAD + FACE + 8 + Math.ceil(n / 2) * PILL + (Math.ceil(n / 2) - 1) * GAP; // header, face, the 8 above the presets, the pill lines
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");
let lastTick = 0; // shortcut: one clock for every drum, so a fast spin buzzes at most every 40 ms
const tick = () => { const n = Date.now(); if (n - lastTick < 40) return; lastTick = n; Haptics.selectionAsync().catch(() => {}); };
const REL = 4; // the relative presets: +15p, +30p, tonight, tomorrow morning
// Stop keys: 0-11 the outer ring (12, 1-11), 12-23 the inner (00, 13-23); minutes use 0-11 (00-55).
const hourOf = (k: number) => (k < 12 ? (k === 0 ? 12 : k) : k === 12 ? 0 : k);
const pt = (r: number, i: number): [number, number] => [C + r * Math.sin((i * Math.PI) / 6), C - r * Math.cos((i * Math.PI) / 6)];

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

type Phase = "h" | "m";
type St = { h: number; m: number; ph: Phase; touched: boolean };

/** The dial itself. Turning it moves the hand and the header only; `onChange` fires once, when the dial closes (a tap outside), and only if the time moved. */
function Clock({ anchor, height, side, value, due, min, past, presets, onChange, onClose }: { anchor: Anchor; height: number; side: "left" | "right"; value: Date; due?: boolean; min?: Date; past?: boolean; presets?: Preset[]; onChange: (d: Date) => void; onClose: () => void }) {
  const th = useTheme();
  // On today only now to midnight is offered: an hour once a quarter of it is left, minutes from now on. `past`: any time (a manual edit).
  const [now] = useState(() => new Date(Date.now())); // Date.now, as the calendar: one clock for both
  const today = value.toDateString() === now.toDateString(), nh = now.getHours(), nm = now.getMinutes();
  // The earliest time offered, in minutes of the day: now on today; an end's `min` (its start + 15) on the start's day.
  const raw = Math.max(today && !past ? nh * 60 + nm : -1, min && min.toDateString() === value.toDateString() ? min.getHours() * 60 + min.getMinutes() : -1);
  const last = (h: number) => (due && h === 23 ? 59 : 55); // a due's 23 also offers :59, the usual "before midnight"
  const floor = HOURS.some((h) => h * 60 + last(h) >= raw) ? raw : -1; // shortcut: past the day's last step nothing is left today; the whole day shows
  const off = (h: number, m: number) => h * 60 + m < floor;
  const hourOff = (h: number) => off(h, last(h));
  // a minute before the floor moves up to the first stop left; a :59 that is still allowed stays as it is
  const fit = (h: number, m: number) => (off(h, m) ? Math.min(last(h), Math.ceil(Math.max(0, floor - h * 60) / 5) * 5) : m);
  const [st, setSt] = useState<St>(() => {
    const h0 = value.getHours();
    const h = hourOff(h0) ? HOURS.find((x) => !hourOff(x)) ?? h0 : h0; // a time already gone starts on the first hour left
    return { h, m: fit(h, value.getMinutes()), ph: "h", touched: false };
  });
  const { h, m, ph, touched } = st;
  // a value picked on the current phase; the hours and minutes that are off take no pick
  const pick = (p: St, phase: Phase, v: number): St => (phase === "h" ? (hourOff(v) ? p : { ...p, h: v, m: fit(v, p.m), touched: true }) : off(p.h, v) ? p : { ...p, m: v, touched: true });
  // the hand's stop: the hour, or the nearest 5p (a 59 sits at 00)
  const stop = ph === "h" ? h : Math.round(m / 5) % 12;
  const prev = useRef(stop);
  useEffect(() => { if (prev.current !== stop) { prev.current = stop; tick(); } }, [stop]); // one tick per stop the hand passes
  // Drags report the stop under the hand (a key, see hourOf); the phase turns on release.
  const drag = (k: number) => setSt((p) => pick(p, p.ph, p.ph === "h" ? hourOf(k) : (k % 12) * 5));
  const release = () => setSt((p) => (p.ph === "h" ? { ...p, ph: "m" } : p)); // letting go of an hour turns to the minutes
  const lastKey = useSharedValue(-1);
  const pan = usePanGesture({
    onActivate: () => { "worklet"; lastKey.set(-1); },
    onUpdate: (e) => {
      "worklet";
      const dx = e.x - C, dy = e.y - C;
      const i = Math.round(((Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 6)) % 12; // nearest stop by angle, 0 at the top
      const k = Math.hypot(dx, dy) < (RO + RI) / 2 ? 12 + i : i; // the inner ring for hours close to the centre
      if (k !== lastKey.get()) { lastKey.set(k); scheduleOnRN(drag, k); }
    },
    onDeactivate: () => { "worklet"; scheduleOnRN(release); },
  });
  const close = () => {
    if (touched && (h !== value.getHours() || m !== value.getMinutes())) { const d = new Date(value); d.setHours(h, m, 0, 0); onChange(d); }
    onClose();
  };
  const items = Array.from({ length: ph === "h" ? 24 : 12 }, (_, k) => {
    const inner = ph === "h" && k >= 12, v = ph === "h" ? hourOf(k) : k * 5;
    const [x, y] = pt(inner ? RI : RO, k % 12);
    const sel = ph === "h" ? v === h : k === stop;
    return { k, x, y, inner, sel, dis: ph === "h" ? hourOff(v) : off(h, v), label: ph === "h" && !inner ? String(v) : pad(v), v };
  });
  const cur = items.find((x) => x.sel) ?? items[0];
  const seg = (p: Phase, text: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setSt((q) => ({ ...q, ph: p }))} style={[s.seg, ph === p && { backgroundColor: th.chip }]}>
      <Text style={[s.rd, { color: ph === p ? th.ink : th.muted }]}>{text}</Text>
    </Pressable>
  );
  return (
    <Drop anchor={anchor} w={TW} h={height} side={side} onClose={close}>
      <GestureHandlerRootView style={s.pad}>
        <View style={s.head}>
          {seg("h", pad(h), "hour")}
          <Text style={[s.rd, { color: th.ink }]}>:</Text>
          {seg("m", pad(m), "minute")}
        </View>
        <GestureDetector gesture={pan}>
          <View style={s.face}>
            <Svg width={FACE} height={FACE}>
              <Circle cx={C} cy={C} r={C} fill={th.chip} />
              <Line x1={C} y1={C} x2={cur.x} y2={cur.y} stroke={th.ink} strokeWidth={1.5} />
              <Circle cx={cur.x} cy={cur.y} r={cur.inner ? 15 : 17} fill={th.ink} />
              <Circle cx={C} cy={C} r={3} fill={th.ink} />
              {items.map((x) => (
                <SvgText key={x.k} x={x.x} y={x.y} fontSize={x.inner ? 12 : 14} fontWeight="600" textAnchor="middle" alignmentBaseline="central" fill={x.sel ? th.bg : x.inner ? th.muted : th.ink} opacity={x.dis ? 0.3 : 1}>{x.label}</SvgText>
              ))}
            </Svg>
            {/* the touch targets: 40px over each number, the labels are what a screen reader and the tests find */}
            {items.map((x) => (
              <Pressable
                key={x.k} disabled={x.dis}
                onPress={() => setSt((p) => { const q = pick(p, p.ph, x.v); return p.ph === "h" ? { ...q, ph: "m" } : q; })} // an hour picked turns to the minutes
                accessibilityRole="button" accessibilityLabel={x.label} accessibilityState={{ selected: x.sel, disabled: x.dis }}
                style={[s.stop, { left: x.x - 20, top: x.y - 20 }]}
              />
            ))}
          </View>
        </GestureDetector>
        <Presets style={s.dpre} pill={s.dpill} items={presets ? presets.map((x) => ({ label: x.label, on: x.on, onPress: () => { onChange(x.at); onClose(); } })) : [
          ...relative(value, now, past, (d) => { onChange(d); onClose(); }),
          ...(due ? DPRE : TPRE).map(([hh, mm]) => ({ label: `${hh}:${pad(mm)}`, off: off(hh, mm), onPress: () => { const d = new Date(value); d.setHours(hh, mm, 0, 0); onChange(d); onClose(); } })),
        ]} />
      </GestureHandlerRootView>
    </Drop>
  );
}

/** The relative chips: 15 and 30 minutes on from the value, tonight at 20:00, tomorrow at 08:00; a time already gone is off. */
function relative(value: Date, now: Date, past: boolean | undefined, pick: (d: Date) => void): { label: string; off: boolean; onPress: () => void }[] {
  const tonight = new Date(now); tonight.setHours(20, 0, 0, 0);
  const morning = new Date(now); morning.setDate(morning.getDate() + 1); morning.setHours(8, 0, 0, 0);
  const later = (k: number) => new Date(value.getTime() + k * 60_000);
  const chip = (label: string, d: Date) => ({ label, off: !past && d.getTime() < now.getTime(), onPress: () => pick(d) });
  return [chip(t("dialPlus15"), later(15)), chip(t("dialPlus30"), later(30)), chip(t("dialTonight"), tonight), chip(t("dialMorning"), morning)];
}

export type Preset = { label: string; at: Date; on?: boolean };

/** The time dial under `anchor` (from measureInWindow). Nothing saves while it turns; `onChange` fires once when it closes (a tap outside), or at once for a preset. `presets`: replace the usual times (an end offers lengths). */
export function TimeDial({ open, anchor, value, due, min, past, presets, side = "right", onChange, onClose }: { open: boolean; anchor?: Anchor; value: Date; due?: boolean; min?: Date; past?: boolean; presets?: Preset[]; side?: "left" | "right"; onChange: (d: Date) => void; onClose: () => void }) {
  if (!open || !anchor) return null;
  return <Clock anchor={anchor} height={TH(presets ? presets.length : (due ? DPRE : TPRE).length + REL)} side={side} value={value} due={due} min={min} past={past} presets={presets} onChange={onChange} onClose={onClose} />;
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
                <Text style={[s.dn, { color: on ? "#fff" : out || off ? th.muted : ts === today ? th.seal : th.ink }, (out || off) && { opacity: 0.5 }, (on || ts === today) && { fontFamily: ff("500") }]}>{d.getDate()}</Text>
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
  head: { height: HEAD, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  seg: { height: 40, paddingHorizontal: 8, borderRadius: 10, justifyContent: "center" },
  rd: { fontSize: 32, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  face: { width: FACE, height: FACE, alignSelf: "center" },
  stop: { position: "absolute", width: 40, height: 40 },
  cal: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10 },
  mh: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  mt: { fontSize: 17, fontFamily: ff("500") },
  arrows: { flexDirection: "row", gap: 4 },
  arrow: { fontSize: 28, lineHeight: 30, fontFamily: ff("500") },
  arrowB: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  gr: { flexDirection: "row", flexWrap: "wrap" },
  wd: { width: "14.2857%", height: 22, textAlign: "center", fontSize: 13, fontFamily: ff("500") },
  dc: { width: "14.2857%", height: CELL, alignItems: "center", justifyContent: "center" },
  dot: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: "center", justifyContent: "center" },
  dn: { fontSize: 17, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  pre: { flexDirection: "row", gap: GAP, justifyContent: "center" },
  dpre: { paddingTop: 8, flexWrap: "wrap" },
  dpill: { width: (TW - 2 * PADX - GAP) / 2, paddingHorizontal: 0 }, // two to a line, the time centred
  cpill: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  pill: { height: PILL, paddingHorizontal: 10, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  pt: { fontSize: 16, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
});
