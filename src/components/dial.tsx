import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeOut, ZoomIn } from "react-native-reanimated";
import { useDrop } from "@/components/outside";
import { EASE, Hit } from "@/components/tap";
import { t } from "@/lib/i18n";
import { ff, useTheme } from "@/lib/theme";

// views.html .dial: zen's round time dial dropped from its chip like a menu. Two rolling drums (hours, minutes in 5p stops), looping like iOS's.
const PADX = 12, PADY = 10;
const PRE = 44, PILL = 44, GAP = 8; // the preset row: views.html .pre, one tap picks and closes
const TW = 208; // two presets to a line, each centred with room on both sides
const FACE = 180; // the two drums: five rows of 36
// A start's usual morning, afternoon, after class, evening; a due's before midnight and midnight.
const TPRE: [number, number][] = [[8, 0], [14, 0], [17, 0], [20, 0]], DPRE: [number, number][] = [[23, 59], [0, 0]];
const TH = (n: number) => 2 * PADY + FACE + 8 + Math.ceil(n / 2) * PILL + (Math.ceil(n / 2) - 1) * GAP; // the drums, the 8 above the presets, the pill lines
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");
let lastTick = 0; // shortcut: one clock for every drum, so a fast spin buzzes at most every 40 ms
const tick = () => { const n = Date.now(); if (n - lastTick < 40) return; lastTick = n; Haptics.selectionAsync().catch(() => {}); };
const REL = 2; // the relative presets: −15p, +15p
const MINS = Array.from({ length: 12 }, (_, i) => i * 5);

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

type St = { h: number; m: number; touched: boolean };
const ITEM = 36, ROWS = 5, WH = ITEM * ROWS, REPS = 7, MID = 3;

/** One iOS-style drum: `n` values rolling in a loop (the last is followed by the first), snapping to a row; the one under the band is `sel`. `dis` rows take no pick, the drum springs back. */
function Wheel({ n, sel, label, dis, a11y, onPick }: { n: number; sel: number; label: (i: number) => string; dis: (i: number) => boolean; a11y: string; onPick: (i: number) => void }) {
  const th = useTheme();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const cur = useRef(sel); // the row under the band right now, while rolling
  const at = (i: number, k = MID) => (k * n + i) * ITEM;
  useEffect(() => { if (cur.current !== sel) { cur.current = sel; ref.current?.scrollTo({ y: at(sel), animated: false }); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps -- at() only reads n
  const settle = (y: number) => {
    const row = Math.round(y / ITEM), k = ((row % n) + n) % n;
    if (dis(k)) { cur.current = sel; ref.current?.scrollTo({ y: at(sel, Math.floor(row / n)), animated: true }); return; }
    cur.current = k;
    onPick(k);
    if (row !== MID * n + k) ref.current?.scrollTo({ y: at(k), animated: false }); // back to the middle copy, so it never runs out
  };
  return (
    <ScrollView
      ref={ref} style={s.wheel} showsVerticalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast" scrollEventThrottle={16}
      contentOffset={{ x: 0, y: at(sel) }} contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      onScroll={(e) => { const k = ((Math.round(e.nativeEvent.contentOffset.y / ITEM) % n) + n) % n; if (k !== cur.current) { cur.current = k; tick(); } }}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => { if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.y); }}
    >
      {Array.from({ length: REPS * n }, (_, r) => {
        const i = r % n, mid = Math.floor(r / n) === MID, d = dis(i);
        return (
          <Pressable key={r} disabled={d} onPress={() => { cur.current = i; ref.current?.scrollTo({ y: at(i), animated: true }); onPick(i); }}
            accessible={mid} accessibilityRole="button" accessibilityLabel={`${a11y} ${label(i)}`} accessibilityState={{ selected: i === sel, disabled: d }} style={s.row}>
            <Text style={[s.rd, { color: th.ink, opacity: d ? 0.3 : 1 }]}>{label(i)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The fade of an iOS drum: the rows thin out toward the top and the bottom, drawn over them in the card's colour so it holds while they roll. */
function Fade({ bg }: { bg: string }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={WH}>
      <Defs>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={`rgb(${bg})`} stopOpacity={0.95} /><Stop offset="0.4" stopColor={`rgb(${bg})`} stopOpacity={0} />
          <Stop offset="0.6" stopColor={`rgb(${bg})`} stopOpacity={0} /><Stop offset="1" stopColor={`rgb(${bg})`} stopOpacity={0.95} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={WH} fill="url(#fade)" />
    </Svg>
  );
}

/** The dial itself: two drums, hours and minutes, as iOS has them. Rolling changes the time in place; `onChange` fires once, when the dial closes (a tap outside), and only if the time moved. */
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
    return { h, m: fit(h, value.getMinutes()), touched: false };
  });
  const { h, m, touched } = st;
  const mins = due ? [...MINS, 59] : MINS; // a due offers :59 after :55
  const mi = m === 59 && due ? 12 : Math.round(m / 5) % 12; // the drum row of the minute (an odd minute sits on its nearest stop)
  const close = () => {
    if (touched && (h !== value.getHours() || m !== value.getMinutes())) { const d = new Date(value); d.setHours(h, m, 0, 0); onChange(d); }
    onClose();
  };
  return (
    <Drop anchor={anchor} w={TW} h={height} side={side} onClose={close}>
      <View style={s.pad}>
        <View style={s.face}>
          <View pointerEvents="none" style={[s.band, { backgroundColor: th.chip }]} />
          <Wheel n={24} sel={h} a11y="hour" label={pad} dis={hourOff} onPick={(i) => setSt((p) => (hourOff(i) ? p : { h: i, m: fit(i, p.m), touched: true }))} />
          <Text style={[s.rd, { color: th.ink }]}>:</Text>
          <Wheel n={mins.length} sel={mi} a11y="minute" label={(i) => pad(mins[i])} dis={(i) => off(h, mins[i])} onPick={(i) => setSt((p) => (off(p.h, mins[i]) ? p : { ...p, m: mins[i], touched: true }))} />
          <Fade bg={th.dark ? "44,44,46" : "250,250,248"} />
        </View>
        <Presets style={s.dpre} pill={s.dpill} items={presets ? presets.map((x) => ({ label: x.label, on: x.on, onPress: () => { onChange(x.at); onClose(); } })) : [
          ...relative(value, now, past, min, (d) => { onChange(d); onClose(); }),
          ...(due ? DPRE : TPRE).map(([hh, mm]) => ({ label: `${hh}:${pad(mm)}`, off: off(hh, mm), onPress: () => { const d = new Date(value); d.setHours(hh, mm, 0, 0); onChange(d); onClose(); } })),
        ]} />
      </View>
    </Drop>
  );
}

/** The relative chips: 15 minutes before and after the value; a time already gone, or before `min`, is off. */
function relative(value: Date, now: Date, past: boolean | undefined, min: Date | undefined, pick: (d: Date) => void): { label: string; off: boolean; onPress: () => void }[] {
  const later = (k: number) => new Date(value.getTime() + k * 60_000);
  const chip = (label: string, d: Date) => ({ label, off: (!past && d.getTime() < now.getTime()) || (!!min && d.getTime() < min.getTime()), onPress: () => pick(d) });
  return [chip(t("dialMinus15"), later(-15)), chip(t("dialPlus15"), later(15))];
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
  rd: { fontSize: 24, fontFamily: ff("500"), fontVariant: ["tabular-nums"] },
  face: { height: WH, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  band: { position: "absolute", left: 0, right: 0, top: ITEM * 2, height: ITEM, borderRadius: 10 },
  wheel: { width: 72, height: WH },
  row: { height: ITEM, alignItems: "center", justifyContent: "center" },
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
